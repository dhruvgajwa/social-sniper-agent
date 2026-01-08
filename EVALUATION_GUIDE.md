# Social Sniper Evaluation System

Comprehensive quality assurance framework for the Social Sniper agentic workflow using Mastra's evaluation tools.

## Overview

The evaluation system provides multi-level quality assessment across:

1. **Intent Classification** - Measures accuracy of high/low intent detection
2. **Event Matching** - Evaluates relevance of event recommendations  
3. **Response Quality** - Assesses tone, safety, and prompt alignment

## Architecture

### Trace-Based Evaluation (Current Implementation)

The evaluation system uses **trace-based evaluation** with Mastra's `evaluate()` function and Metric classes. This approach:

- ✅ Analyzes agent inputs/outputs after execution (post-hoc analysis)
- ✅ Uses sophisticated LLM judges and statistical metrics
- ✅ Suitable for batch testing, CI/CD, and periodic quality checks
- ❌ Does **not** run during live agent execution

**Why Trace-Based?**

The `@mastra/evals` package (v0.14.4) only exports Metric classes for post-execution analysis, not live scorers. See `EVALUATION_IMPLEMENTATION_NOTES.md` for technical details.

**Available Metrics:**

From `@mastra/evals/llm`:
- `AnswerRelevancyMetric` - Query-answer alignment
- `FaithfulnessMetric` - Response accuracy to context
- `HallucinationMetric` - Detects fabricated information
- `PromptAlignmentMetric` - Validates instruction following
- `ToxicityMetric` - Identifies harmful content
- `BiasMetric` - Detects potential biases
- `ContextPrecisionMetric` - Evaluates retrieved context quality
- `ContextRelevancyMetric` - Measures context relevance

From `@mastra/evals/nlp`:
- `CompletenessMetric` - Response thoroughness
- `ToneConsistencyMetric` - Tone alignment
- `ContentSimilarityMetric` - Output similarity comparison

### Test Datasets

1. **Intent Classification** (`intent-classification-test-cases.json`)
   - 10 test cases (6 high-intent, 3 low-intent, 1 edge case)
   - Ground truth labels with expected confidence scores
   - Context extraction validation

2. **Event Matching** (`event-matching-test-cases.json`)
   - 5 scenarios covering different event types
   - Expected relevance scores
   - No-match handling validation

3. **Response Quality** (`response-quality-test-cases.json`)
   - 3 scenarios (with events, without events, edge cases)
   - Expected tone, length, structure
   - Safety metrics (toxicity, bias)

**Evaluation Scripts:**

1. **Intent Evaluation** (`run-intent-evals.ts`)
   ```bash
   npm run eval:intent
   ```
   - Measures: Accuracy, Precision, Recall, F1 Score
   - Goal: <10% false positive rate
   - Outputs: Confusion matrix, confidence calibration

2. **Response Evaluation** (`run-response-evals.ts`)
   ```bash
   npm run eval:response
   ```
   - Generates responses for test cases
   - Manual review guided by expected metrics
   - Live scorers evaluate in real-time

3. **Score Viewer** (`view-scores.ts`)
   ```bash
   npm run eval:view
   ```
   - Queries `mastra_scorers` table
   - Shows recent scores, trends, statistics
   - Breakdowns by agent and scorer type

## Installation & Setup

### 1. Install Dependencies

Already installed during implementation:
```bash
pnpm install @mastra/evals@latest  # Scorers framework
pnpm add -D tsx                     # TypeScript execution
```

### 2. Configure Environment

Ensure `.env` has database configuration:
```env
# LibSQL for scorer storage (default: file-based)
LIBSQL_URL=file:./mastra.db
LIBSQL_AUTH_TOKEN=  # Optional for remote database
```

### 3. Verify Setup

Check that scorers are registered:
```bash
npm run dev  # Start Mastra Studio
```
- Navigate to Agents section
- Verify scorers appear for each agent
- Check sampling rates (20%)

## Usage

### Running Evaluations

**Test intent classification:**
```bash
npm run eval:intent
```

Expected output:
- Test case results (✅/❌ per case)
- Performance metrics (accuracy, precision, recall, F1)
- False positive/negative rates
- Confidence calibration analysis
- Failed case details for debugging

**Test response quality:**
```bash
npm run eval:response
```

Expected output:
- Generated responses for each test case
- Manual review guidelines
- Expected quality metrics
- Live scorer activation confirmation

**View scoring history:**
```bash
npm run eval:view
```

Expected output:
- Total scorer records count
- Recent 20 scores with details
- Scorer statistics (avg, min, max per scorer)
- Agent-specific breakdowns

### Interpreting Results

**Intent Classification Metrics:**
- **Accuracy**: Overall correctness (target: >85%)
- **Precision**: % of predicted high-intent that are correct (target: >80%)
- **Recall**: % of actual high-intent detected (target: >90%)
- **False Positive Rate**: % of low-intent misclassified (target: <10%)

**Scorer Ranges:**
- **0.8-1.0**: Excellent performance
- **0.6-0.8**: Good performance, minor improvements needed
- **0.4-0.6**: Moderate performance, review required
- **0.0-0.4**: Poor performance, investigation needed

**Safety Thresholds:**
- **Toxicity**: Must be <0.2 (blocking threshold: 0.7 via ModerationProcessor)
- **Bias**: Target <0.3
- **Hallucination**: Target <0.2

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/eval.yml
name: Agent Evaluation

on:
  pull_request:
    paths:
      - 'social-sniper-agent/src/**'
  
jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: cd social-sniper-agent && pnpm install
      
      - name: Run intent classification eval
        run: cd social-sniper-agent && npm run eval:intent
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      
      - name: Run response quality eval
        run: cd social-sniper-agent && npm run eval:response
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      
      - name: View scorer results
        run: cd social-sniper-agent && npm run eval:view
```

### Setting Score Thresholds

Modify evaluation scripts to fail builds on poor performance:

```typescript
// In run-intent-evals.ts
if (falsePositiveRate > 0.1) {
  console.error("❌ False positive rate exceeds 10% threshold!");
  process.exit(1);
}

if (accuracy < 0.85) {
  console.error("❌ Accuracy below 85% threshold!");
  process.exit(1);
}
```

## Monitoring & Optimization

### Tracking Performance Trends

1. **Daily Monitoring**: Run `npm run eval:view` to check recent scores
2. **Weekly Analysis**: Review scorer statistics for degradation
3. **Monthly Audits**: Run full evaluation suite and compare with baselines

### Optimization Workflow

**When scores drop:**

1. **Identify Issue**:
   ```bash
   npm run eval:view  # Check which scorer is degraded
   ```

2. **Debug with Test Cases**:
   ```bash
   npm run eval:intent   # For classification issues
   npm run eval:response # For response quality issues
   ```

3. **Iterate on Prompts/Instructions**:
   - Adjust agent instructions in `src/mastra/agents/`
   - Update scorer configurations if needed
   - Test changes with evaluation scripts

4. **Validate Improvement**:
   - Re-run evaluations
   - Compare scores before/after
   - Deploy if metrics improve

### Adjusting Sampling Rates

**Production (Cost Optimization):**
```typescript
scorers: [
  answerRelevancy({
    model: openai("gpt-4o-mini"),
    rate: 0.1,  // 10% - lower cost, less coverage
  }),
]
```

**Development (Full Coverage):**
```typescript
scorers: [
  answerRelevancy({
    model: openai("gpt-4o-mini"),
    rate: 1.0,  // 100% - higher cost, full insights
  }),
]
```

## File Structure

```
social-sniper-agent/src/evals/
├── data/
│   ├── intent-classification-test-cases.json    # 10 golden intent examples
│   ├── event-matching-test-cases.json           # 5 event matching scenarios
│   └── response-quality-test-cases.json         # 3 response templates
├── run-intent-evals.ts                          # Intent classification testing
├── run-response-evals.ts                        # Response quality testing
└── view-scores.ts                               # Scorer results viewer
```

## Best Practices

### Test Dataset Maintenance

1. **Expand Gradually**: Add 2-3 test cases per sprint
2. **Cover Edge Cases**: Include ambiguous, borderline inputs
3. **Update Ground Truth**: Revise expected values as system improves
4. **Real-World Examples**: Pull from actual Reddit/Twitter posts

### Scorer Configuration

1. **Start Conservative**: Use 20% sampling initially
2. **Monitor Costs**: Check OpenAI/Anthropic usage in dashboards
3. **Balance Coverage**: Higher sampling for critical agents
4. **Iterate Based on Data**: Adjust after collecting baseline

### Evaluation Cadence

1. **Pre-Commit**: Run intent eval before pushing changes
2. **CI/CD**: Automated eval on every PR
3. **Weekly**: Full response eval + manual review
4. **Monthly**: Deep dive into scorer trends

## Troubleshooting

### Scorer Results Not Appearing

**Check:**
1. Agents have scorers configured in `src/mastra/agents/`
2. Sampling rate > 0 (e.g., `rate: 0.2`)
3. Database connection working (`LIBSQL_URL` in `.env`)
4. Run `npm run eval:view` to verify table creation

**Solution:**
```bash
# Test scorer execution manually
npm run eval:response  # Triggers live scorers
npm run eval:view      # Should show new records
```

### Evaluation Scripts Failing

**Common Issues:**
1. **Missing API Keys**: Set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` in `.env`
2. **Database Lock**: Close other Mastra processes
3. **Import Errors**: Ensure `type: "module"` in `package.json`
4. **Path Issues**: Run from `social-sniper-agent/` directory

**Debug:**
```bash
# Verbose output
tsx src/evals/run-intent-evals.ts

# Check environment
cat .env | grep -E "OPENAI|ANTHROPIC|LIBSQL"
```

### Low Scores Across All Agents

**Investigate:**
1. **Model Changes**: Check if provider changed model behavior
2. **Prompt Drift**: Review agent instructions for unintended changes
3. **Data Shift**: Verify test cases still represent target domain
4. **Scorer Calibration**: Re-evaluate scorer thresholds

**Action:**
```bash
# Compare with baseline
npm run eval:intent > current_results.txt
diff baseline_results.txt current_results.txt
```

## Future Enhancements

### Planned Features

1. **Custom Scorer for False Positives**:
   - Use `createScorer` from `@mastra/evals`
   - Implement ground-truth comparison
   - Track precision/recall directly

2. **Approval System Metrics**:
   - Query `approvals.db` for approval patterns
   - Measure human approval rate
   - Track edit frequency and rejection reasons

3. **End-to-End Workflow Scoring**:
   - Add scorers to workflow steps
   - Track success rate from fetch → post
   - Measure latency and throughput

4. **Performance Dashboard**:
   - Visualize scorer trends over time
   - Alert on degradation
   - Compare agents and workflows

5. **A/B Testing Framework**:
   - Test prompt variations
   - Compare model performance (GPT-4o-mini vs Claude)
   - Measure impact of threshold changes

### Contributing

To add new test cases:

1. Edit JSON files in `src/evals/data/`
2. Follow existing schema structure
3. Include reasoning and expected outputs
4. Run evaluation to verify

To add new scorers:

1. Import from `@mastra/evals` or create custom with `createScorer`
2. Add to agent configuration in `src/mastra/agents/`
3. Set appropriate sampling rate
4. Document in this README

To modify evaluation scripts:

1. Update `src/evals/run-*.ts` files
2. Test with sample data
3. Update npm scripts if needed
4. Document changes here

## References

- [Mastra Scorers Documentation](https://docs.mastra.ai/docs/scorers/overview)
- [Built-in Scorers](https://docs.mastra.ai/docs/scorers/built-in-scorers)
- [Custom Scorers](https://docs.mastra.ai/docs/scorers/custom-scorers)
- [AI Tracing](https://docs.mastra.ai/docs/observability/ai-tracing/overview)

## Support

For evaluation system issues:
1. Check this README's Troubleshooting section
2. Review Mastra documentation linked above
3. Inspect scorer results with `npm run eval:view`
4. Examine agent configurations in `src/mastra/agents/`

---

**Last Updated**: December 22, 2024
**Version**: 1.0.0
**Maintainer**: EventHive Team

# Evaluation System Implementation Notes

## Summary

This document explains the current state of the evaluation system implementation and the limitations discovered during development.

## What Was Attempted

Initially, the plan was to implement a comprehensive evaluation system with:

1. **Live Scorers on Agents**: Real-time quality monitoring for each agent using @mastra/evals scorers
2. **Batch Evaluation Scripts**: Test suites to evaluate agents against known test cases
3. **Performance Tracking**: Historical scorer data stored in LibSQL database

## Current Implementation Status

### ✅ Successfully Implemented

1. **Test Datasets** (`src/evals/data/`)
   - `intent-classification-test-cases.json`: 10 test cases for intent classification
   - `event-matching-test-cases.json`: 5 test cases for event recommendations
   - `response-quality-test-cases.json`: 3 test cases for response quality
   
2. **Evaluation Scripts** (`src/evals/`)
   - `run-intent-evals.ts`: Batch evaluation script for intent classifier
   - `run-response-evals.ts`: Batch evaluation for response quality
   - `view-scores.ts`: Utility to view historical scorer results

3. **Documentation**
   - `EVALUATION_GUIDE.md`: Comprehensive guide for trace-based evaluation
   - npm scripts configured in `package.json`

4. **Dependencies**
   - `@mastra/evals@0.14.4`: Installed successfully
   - `tsx@4.21.0`: For running TypeScript scripts directly

### ❌ Not Implemented: Live Scorers

**Why**: The `@mastra/evals` package (v0.14.4) does not export pre-built scorer functions for live agent evaluation.

**Technical Details**:
- Package structure:
  - `@mastra/evals` exports: `evaluate`, `attachListeners`, `globalSetup`
  - `@mastra/evals/llm` exports: `AnswerRelevancyMetric`, `FaithfulnessMetric`, etc. (Metric classes)
  - `@mastra/evals/nlp` exports: `CompletenessMetric`, `ToneConsistencyMetric`, etc. (Metric classes)
  
- The `createScorer` functions found in `dist/scorers/llm/*` are **internal implementations** and not exported
- Metrics are designed for **trace evaluation** (post-hoc analysis), not live scoring during agent execution

**What This Means**:
- Cannot use `scorers: { ... }` configuration on Agent definitions
- Must use trace-based evaluation with the `evaluate()` function and Metric classes
- Live scoring would require building custom scorers from scratch using `@mastra/core/scores`

## How to Use the Evaluation System

### Trace-Based Evaluation (Recommended)

Use the `evaluate()` function with Metric classes for post-hoc analysis:

```typescript
import { evaluate } from '@mastra/evals';
import { AnswerRelevancyMetric } from '@mastra/evals/llm';
import { openai } from '@ai-sdk/openai';

const metric = new AnswerRelevancyMetric(openai('gpt-4o-mini'));

const result = await evaluate({
  metrics: [metric],
  traces: [
    {
      input: 'What is the capital of France?',
      output: 'Paris is the capital of France.',
    },
  ],
});
```

### Batch Testing with Evaluation Scripts

Run the provided evaluation scripts:

```bash
# Test intent classification accuracy
npm run eval:intent

# Test response quality
npm run eval:response

# View historical results
npm run eval:view
```

## Alternative Approaches for Live Scoring

If you need live quality monitoring during agent execution, you have these options:

### Option 1: Custom Scorers

Build custom scorers using `@mastra/core/scores`:

```typescript
import { createScorer } from '@mastra/core/scores';

const customScorer = createScorer({
  name: 'My Custom Scorer',
  description: 'Evaluates specific quality metrics',
  judge: {
    model: openai('gpt-4o-mini'),
    instructions: 'Your evaluation instructions...',
  },
  type: 'agent',
})
.analyze({
  // Your analysis logic
})
.generateScore({
  // Your scoring logic
});

// Use in agent
const myAgent = new Agent({
  scorers: {
    myCustom: {
      scorer: customScorer,
      sampling: { type: 'ratio', rate: 0.2 },
    },
  },
});
```

### Option 2: Post-Processing Pipeline

Add evaluation as a post-processing step after agent execution:

```typescript
async function runWithEvaluation(agent, input) {
  const output = await agent.generate(input);
  
  // Evaluate using Metrics
  const metrics = [
    new AnswerRelevancyMetric(openai('gpt-4o-mini')),
    new ToxicityMetric(openai('gpt-4o-mini')),
  ];
  
  const evaluation = await evaluate({
    metrics,
    traces: [{ input, output }],
  });
  
  return { output, evaluation };
}
```

### Option 3: Periodic Trace Analysis

Collect execution traces and analyze them periodically:

1. Store all agent inputs/outputs in database
2. Run batch evaluation daily/weekly using `evaluate()`
3. Monitor trends and identify regressions

## Current Agent Configuration

All three agents (intent-classifier, event-recommender, response-writer) have been configured **without** live scorers due to the above limitations. The code includes documentation explaining this decision.

## Test Data Quality

The test datasets are production-ready:

- **Intent Classification**: 10 cases covering high-intent, low-intent, and edge cases
- **Event Matching**: 5 scenarios testing different event types and search queries
- **Response Quality**: 3 cases testing tone, safety, and event integration

These datasets can be used with the evaluation scripts immediately.

## Next Steps

1. **Try Trace Evaluation**: Use `evaluate()` with Metric classes to test the approach
2. **Build Custom Scorers**: If live scoring is required, implement custom scorers
3. **CI/CD Integration**: Add evaluation scripts to GitHub Actions workflow
4. **Expand Test Coverage**: Add more test cases as edge cases are discovered
5. **Monitor Production**: Set up trace collection and periodic batch evaluation

## References

- Mastra Evals Documentation: https://mastra.ai/docs/evals
- Test Datasets: `src/evals/data/`
- Evaluation Scripts: `src/evals/`
- Comprehensive Guide: `EVALUATION_GUIDE.md`

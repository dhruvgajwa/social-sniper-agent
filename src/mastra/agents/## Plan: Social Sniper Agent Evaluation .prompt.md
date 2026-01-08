## Plan: Social Sniper Agent Evaluation Strategy

An evaluation framework to measure and optimize the Social Sniper agent's
performance across accuracy, conversion, and safety metrics using Mastra's
built-in scorers and custom metrics.

### Steps

1. **Create Intent Classification Scorers** in
   `src/mastra/scorers/intent-scorers.ts`
   - Implement `IntentAccuracyScorer` to track false positive/negative rates
     against labeled test data
   - Add `ContextExtractionScorer` to validate location, vibe, budget, and
     timeframe extraction quality
   - Set up baseline metrics dataset with 100+ labeled social media posts

2. **Build Event Recommendation Evaluators** in
   `src/mastra/scorers/event-scorers.ts`
   - Create `RelevanceScorer` using LLM-as-judge pattern to rate event-to-query
     matching (0-1 scale)
   - Implement `HallucinationDetector` to verify all recommended events exist in
     database
   - Add `DiversityScorer` to ensure variety in recommendations (not always same
     events)

3. **Implement Response Quality Metrics** in
   `src/mastra/scorers/response-scorers.ts`
   - Use `ToneConsistencyScorer` to validate casual, helpful "bhai/bro" tone
     adherence
   - Add `ModerationPassRateScorer` to track safety filter effectiveness
   - Create `LinkAccuracyScorer` to verify EventHive URLs are properly formatted

4. **Set Up End-to-End Workflow Evaluation** in
   `src/mastra/workflows/eval-workflow.ts`
   - Build evaluation workflow that runs pipeline on test dataset
   - Attach all scorers to workflow steps for comprehensive metrics
   - Log results to storage for historical tracking and regression detection

5. **Create Evaluation Dashboard** in `src/eval-dashboard.ts`
   - Aggregate scorer outputs into actionable reports
   - Track KPIs: false positive rate (<10%), conversion rate (>5%),
     click-through (>50)
   - Generate A/B test comparisons for model/prompt variations

6. **Implement Continuous Evaluation** in `src/mastra/index.ts`
   - Configure sampling rates for production scorer runs (e.g., 10% of traffic)
   - Set up telemetry and observability for real-time monitoring
   - Create alerts for metric degradation (false positives spike, quality drop)

### Further Considerations

1. **Human Feedback Loop**: Should we implement thumbs-up/down on approved
   responses to build a reinforcement learning dataset? This could improve
   response quality over time.

2. **Test Data Sources**: Use real historical EventHive interactions, manually
   labeled social posts, or synthetic data? Hybrid approach recommended - start
   with 50 manual labels + 200 synthetic examples.

3. **Evaluation Frequency**: Run full eval suite on every deployment (CI/CD),
   daily on production sample, or continuous sampling? Suggest: Daily batch
   eval + 10% live traffic sampling with alerts.

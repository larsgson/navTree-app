import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

// Load model from bundled files instead of downloading from Hugging Face
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = '/models/';

let extractor: FeatureExtractionPipeline | null = null;
let loading: Promise<FeatureExtractionPipeline> | null = null;

export async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;
  if (loading) return loading;

  loading = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    dtype: 'q8',
  });

  extractor = await loading;
  loading = null;
  return extractor;
}

export async function embedQuery(text: string): Promise<Float32Array> {
  const model = await getEmbedder();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return output.data as Float32Array;
}

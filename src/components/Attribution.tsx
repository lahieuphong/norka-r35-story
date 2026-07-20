import type { ModelAttribution } from '../three/CarModel';
interface Props { readonly model: ModelAttribution; }
export function Attribution({ model }: Props) {
  return <footer className="attribution"><p>3D model “{model.title}” by {model.author}. Material presentation adapted from the vecarz Sketchfab edition. Licensed under {model.license}.</p><p>Optimized and adapted for this non-commercial interactive demo. Unofficial automotive concept experience.</p></footer>;
}

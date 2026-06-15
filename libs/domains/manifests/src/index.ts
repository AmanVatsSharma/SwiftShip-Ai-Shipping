// Re-export barrel for the Manifests lib.
// SS-043a: the service is TypeORM-backed; the legacy shim and the
// `src/manifests/` re-exports have been removed.

export { ManifestsModule, ManifestsModule as ManifestsLibModule } from './lib/manifests.module';
export { ManifestsService, ManifestsService as ManifestsLibService } from './lib/manifests.service';
export { ManifestsResolver, ManifestsResolver as ManifestsLibResolver } from './lib/manifests.resolver';
export { GenerateManifestInput } from './lib/generate-manifest.input';

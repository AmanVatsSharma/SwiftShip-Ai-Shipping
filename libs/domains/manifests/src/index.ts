// Re-export barrel for the Manifests lib.
// SS-043b: the service is now TypeORM-backed; the legacy PrismaCompat
// shim and the `src/manifests/` re-exports have been removed.

export { ManifestsModule, ManifestsModule as ManifestsLibModule } from './lib/manifests.module';
export { ManifestsService, ManifestsService as ManifestsLibService } from './lib/manifests.service';
export { ManifestsResolver, ManifestsResolver as ManifestsLibResolver } from './lib/manifests.resolver';
export { GenerateManifestInput } from './lib/generate-manifest.input';

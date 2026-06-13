// Re-export barrel for the Manifests lib.
// Until Plan 3 ships a full TypeORM implementation, the src/ implementation
// runs against PrismaCompat (TypeORM-backed). New consumers should import
// from `@swiftship/domains-manifests` rather than the relative `../manifests` paths.

export { ManifestsModule, ManifestsModule as ManifestsLibModule } from '../../../../src/manifests/manifests.module';
export { ManifestsService, ManifestsService as ManifestsLibService } from '../../../../src/manifests/manifests.service';
export { ManifestsResolver, ManifestsResolver as ManifestsLibResolver } from '../../../../src/manifests/manifests.resolver';
export { GenerateManifestInput } from '../../../../src/manifests/generate-manifest.input';

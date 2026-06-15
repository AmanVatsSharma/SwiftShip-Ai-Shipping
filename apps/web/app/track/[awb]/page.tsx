import { getTrackingByAwb } from '../../../../lib/tracking';
import { TrackHeader } from './TrackHeader';
import { TrackTimeline } from './TrackTimeline';
import { NotFound } from './NotFound';

// Refresh the page at most once a minute so live tracking stays reasonably
// current without hammering the API on every request.
export const revalidate = 60;

export const metadata = {
  title: 'Track your shipment — SwiftShip',
  description:
    'Live tracking timeline, courier info and ETA for your SwiftShip shipment.',
};

interface PageProps {
  params: { awb: string };
  searchParams?: { tenant?: string };
}

export default async function TrackAwbPage({ params, searchParams }: PageProps) {
  const awb = decodeURIComponent(params.awb || '');
  const tenantSlug =
    (searchParams?.tenant && String(searchParams.tenant)) || 'swiftship';

  const { shipment, tenant } = await getTrackingByAwb(awb, tenantSlug);

  return (
    <main
      className="min-h-full bg-slate-50"
      style={
        tenant.brandColor
          ? ({ ['--brand-color' as string]: tenant.brandColor } as React.CSSProperties)
          : undefined
      }
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <TrackHeader
          awb={awb}
          tenant={tenant}
          status={shipment?.status ?? null}
          carrierId={shipment?.carrierId ?? null}
          shippedAt={shipment?.shippedAt ?? null}
          deliveredAt={shipment?.deliveredAt ?? null}
        />

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:mt-8 sm:p-6">
          {shipment ? (
            <TrackTimeline events={shipment.trackingEvents ?? []} />
          ) : (
            <NotFound awb={awb} />
          )}
        </section>

        <footer className="mt-8 text-center text-xs text-slate-500">
          Powered by{' '}
          <span className="font-medium text-slate-700">SwiftShip AI</span>
        </footer>
      </div>
    </main>
  );
}

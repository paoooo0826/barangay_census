import { QRCodeSVG } from 'qrcode.react';
import { Download, QrCode } from 'lucide-react';
import type { Resident } from '../types/database';

interface ResidentQrCardProps {
  resident: Resident;
  compact?: boolean;
}

function buildQrValue(resident: Resident): string {
  return JSON.stringify({
    type: 'barangay-census-resident',
    residentId: resident.id,
    trackingNumber: resident.tracking_number,
    name: [resident.first_name, resident.middle_name, resident.last_name, resident.suffix]
      .filter(Boolean)
      .join(' '),
    barangay: resident.barangay,
  });
}

export default function ResidentQrCard({ resident, compact = false }: ResidentQrCardProps) {
  const qrValue = buildQrValue(resident);
  const qrId = `resident-qr-${resident.id}`;

  const downloadQr = () => {
    const svg = document.getElementById(qrId);
    if (!svg) return;

    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${resident.tracking_number || 'resident'}-qr.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className={`rounded-3xl border border-slate-200 bg-white shadow-sm ${compact ? 'p-5' : 'p-6 sm:p-8'}`}>
      <div className={`flex gap-5 ${compact ? 'flex-col sm:flex-row sm:items-center' : 'flex-col md:flex-row md:items-center md:justify-between'}`}>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
            <QrCode className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-700">Resident QR Code</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Digital census identification</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Scan this code to read the resident tracking number and record identifier.
            </p>
            <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Tracking Number</p>
              <p className="mt-1 font-bold text-blue-700">{resident.tracking_number}</p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <QRCodeSVG
            id={qrId}
            value={qrValue}
            size={compact ? 150 : 180}
            level="H"
            includeMargin
            title={`QR code for ${resident.tracking_number}`}
          />
          <button
            type="button"
            onClick={downloadQr}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          >
            <Download className="h-4 w-4" />
            Download QR
          </button>
        </div>
      </div>
    </section>
  );
}

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, PackageCheck } from 'lucide-react';
import type { Shipment } from '../types';
import { VerificationText } from './StatusText';

export const ShipmentQRModal: React.FC<{
  shipment: Shipment | null;
  onClose: () => void;
}> = ({ shipment, onClose }) => {
  if (!shipment) return null;

  const qrPayload = JSON.stringify({
    shipmentCode: shipment.shipment_code,
    resource: shipment.resource_name,
    quantity: shipment.allocated_quantity,
    destination: shipment.location_name,
    status: shipment.status,
  });

  const steps = ['Preparing', 'Dispatched', 'In Transit', 'Delivered'];
  const activeIdx =
    shipment.status === 'Delivered' || shipment.status === 'Partially Delivered'
      ? 3
      : Math.max(0, steps.indexOf(shipment.status));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div>
            <p className="text-xs text-[#697780]">Digital Relief Waybill</p>
            <h3 className="text-lg font-semibold text-[#1E3043] font-mono-tabular">{shipment.shipment_code}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#697780] hover:bg-slate-100 hover:text-[#1E3043]"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 flex flex-col items-center rounded-xl border border-slate-200 bg-[#F5F7F7] p-5">
          <div className="rounded-lg bg-white p-3 border border-slate-200">
            <QRCodeSVG value={qrPayload} size={156} level="M" fgColor="#1E3043" />
          </div>
          <p className="mt-3 text-xs text-[#697780]">Scan at relief checkpoint to verify cargo & handover</p>
        </div>

        <div className="mt-5 space-y-2.5 text-sm">
          <div className="flex justify-between">
            <span className="text-[#697780]">Resource</span>
            <span className="font-medium text-[#1E3043] tabular-nums">
              {shipment.allocated_quantity} {shipment.unit} {shipment.resource_name}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#697780]">Source NGO</span>
            <span className="font-medium text-[#1E3043]">{shipment.organisation_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#697780]">Destination</span>
            <span className="font-medium text-[#1E3043] text-right">{shipment.location_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#697780]">Current Status</span>
            <VerificationText status={shipment.status} />
          </div>
          <div className="flex justify-between">
            <span className="text-[#697780]">Received Quantity</span>
            <span className="font-mono-tabular font-medium text-[#1E3043]">
              {shipment.received_quantity} / {shipment.allocated_quantity}
            </span>
          </div>
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
            {steps.map((step, i) => (
              <div key={step} className="space-y-1">
                <div className={`h-1.5 rounded-full ${i <= activeIdx ? 'bg-[#268A87]' : 'bg-slate-200'}`} />
                <span className={i <= activeIdx ? 'font-semibold text-[#1E3043]' : 'text-[#697780]'}>{step}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-[#1E3043] py-2.5 text-sm font-semibold text-white hover:bg-[#1E3043]/90"
        >
          <PackageCheck className="h-4 w-4" />
          Done
        </button>
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Search, MapPin } from 'lucide-react';

export interface MapIncidentMarker {
  id: number;
  incident_name: string;
  disaster_type: string;
  location_name: string;
  latitude: number;
  longitude: number;
  affected_people: number;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  status: string;
  verification_status?: string;
  requested_resources?: string;
  isPendingReport?: boolean;
}

export interface MapOrgMarker {
  id: number;
  organisation_name: string;
  organisation_type: 'NGO' | 'Hospital' | 'Relief Centre';
  address: string;
  latitude: number;
  longitude: number;
  total_stock?: number;
  available_beds?: number;
  total_beds?: number;
}

interface ChennaiMapProps {
  incidents: MapIncidentMarker[];
  pendingReports?: MapIncidentMarker[];
  organisations: MapOrgMarker[];
  heightClass?: string;
  compact?: boolean;
  onSelectIncident?: (incident: MapIncidentMarker) => void;
}

type FilterMode = 'all' | 'Critical' | 'High' | 'Medium' | 'Verified' | 'Pending' | 'NGO' | 'Hospital';

export const ChennaiMap: React.FC<ChennaiMapProps> = ({
  incidents,
  pendingReports = [],
  organisations,
  heightClass = 'h-[480px]',
  compact = false,
  onSelectIncident,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const [filter, setFilter] = useState<FilterMode>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const allIncidents = useMemo(() => {
    const verified = incidents.map((i) => ({ ...i, verification_status: 'Verified', isPendingReport: false }));
    const pending = pendingReports.map((p) => ({ ...p, verification_status: 'Pending', isPendingReport: true }));
    return [...verified, ...pending];
  }, [incidents, pendingReports]);

  const filteredIncidents = useMemo(() => {
    return allIncidents.filter((item) => {
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        if (
          !item.location_name.toLowerCase().includes(q) &&
          !item.incident_name.toLowerCase().includes(q) &&
          !item.disaster_type.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (filter === 'Critical' || filter === 'High' || filter === 'Medium') return item.severity === filter;
      if (filter === 'Verified') return item.verification_status === 'Verified';
      if (filter === 'Pending') return item.verification_status === 'Pending';
      if (filter === 'NGO' || filter === 'Hospital') return false;
      return true;
    });
  }, [allIncidents, filter, searchTerm]);

  const filteredOrgs = useMemo(() => {
    return organisations.filter((org) => {
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        if (!org.organisation_name.toLowerCase().includes(q) && !org.address.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (filter === 'NGO') return org.organisation_type === 'NGO' || org.organisation_type === 'Relief Centre';
      if (filter === 'Hospital') return org.organisation_type === 'Hospital';
      if (['Critical', 'High', 'Medium', 'Pending'].includes(filter)) return false;
      return true;
    });
  }, [organisations, filter, searchTerm]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [13.018, 80.22],
      zoom: compact ? 11 : 12,
      scrollWheelZoom: !compact,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    setTimeout(() => map.invalidateSize(), 250);

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, [compact]);

  useEffect(() => {
    const group = layerGroupRef.current;
    const map = mapRef.current;
    if (!group || !map) return;

    group.clearLayers();

    const getSeverityColor = (severity: string) => {
      if (severity === 'Critical') return '#D9534F';
      if (severity === 'High') return '#E49B43';
      return '#D4A72C';
    };

    for (const inc of filteredIncidents) {
      const color = getSeverityColor(inc.severity);
      const marker = L.circleMarker([inc.latitude, inc.longitude], {
        radius: inc.severity === 'Critical' ? 11 : 8,
        color: '#FFFFFF',
        weight: 2,
        fillColor: color,
        fillOpacity: inc.isPendingReport ? 0.65 : 0.92,
        dashArray: inc.isPendingReport ? '3,3' : undefined,
      });

      const popupHtml = `
        <div style="min-width:210px;font-family:Manrope,sans-serif;color:#1E3043;">
          <div style="font-size:11px;color:#697780;margin-bottom:2px;">Simulated Incident #${inc.id} · ${inc.verification_status}</div>
          <div style="font-weight:700;font-size:13px;margin-bottom:4px;">${inc.incident_name}</div>
          <div style="font-size:12px;margin-bottom:6px;color:#475569;">${inc.location_name}</div>
          <div style="display:flex;justify-content:space-between;font-size:11px;border-top:1px solid #E2E8F0;padding-top:6px;">
            <span><strong>Priority:</strong> ${inc.severity}</span>
            <span><strong>Affected:</strong> ${inc.affected_people}</span>
          </div>
          <div style="font-size:11px;margin-top:4px;color:#697780;">Category: ${inc.disaster_type}</div>
        </div>
      `;
      marker.bindPopup(popupHtml);
      marker.on('click', () => onSelectIncident?.(inc));
      marker.addTo(group);
    }

    for (const org of filteredOrgs) {
      const color =
        org.organisation_type === 'Hospital'
          ? '#2563EB'
          : org.organisation_type === 'Relief Centre'
          ? '#39856D'
          : '#7C3AED';

      const marker = L.circleMarker([org.latitude, org.longitude], {
        radius: 8,
        color: '#1E3043',
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.9,
      });

      const stockOrBeds =
        org.organisation_type === 'Hospital'
          ? `Available Beds: ${org.available_beds ?? '--'} / ${org.total_beds ?? '--'}`
          : `Available Stock: ${org.total_stock ?? 0} units`;

      marker.bindPopup(`
        <div style="min-width:200px;font-family:Manrope,sans-serif;color:#1E3043;">
          <div style="font-size:11px;color:#697780;margin-bottom:2px;">${org.organisation_type} (Simulated)</div>
          <div style="font-weight:700;font-size:13px;margin-bottom:4px;">${org.organisation_name}</div>
          <div style="font-size:12px;color:#475569;margin-bottom:4px;">${org.address}</div>
          <div style="font-size:11px;border-top:1px solid #E2E8F0;padding-top:5px;">${stockOrBeds}</div>
        </div>
      `);
      marker.addTo(group);
    }
  }, [filteredIncidents, filteredOrgs, onSelectIncident]);

  const filterButtons: Array<{ key: FilterMode; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'Critical', label: 'Critical' },
    { key: 'High', label: 'High' },
    { key: 'Medium', label: 'Medium' },
    { key: 'Verified', label: 'Verified' },
    { key: 'Pending', label: 'Pending' },
    { key: 'NGO', label: 'NGOs & Centres' },
    { key: 'Hospital', label: 'Hospitals' },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {!compact && (
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {filterButtons.map((btn) => (
              <button
                key={btn.key}
                type="button"
                onClick={() => setFilter(btn.key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  filter === btn.key
                    ? 'bg-[#1E3043] text-white'
                    : 'bg-white text-[#697780] border border-slate-200 hover:text-[#1E3043]'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
          <div className="relative w-full lg:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#697780]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search Chennai area or org..."
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-[#1E3043] placeholder:text-[#697780] focus:border-[#268A87] focus:outline-none"
            />
          </div>
        </div>
      )}

      <div ref={containerRef} className={`w-full ${heightClass}`} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-2.5 text-xs text-[#697780]">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#D9534F]" /> Critical</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#E49B43]" /> High</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#D4A72C]" /> Medium</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#7C3AED]" /> NGO</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#2563EB]" /> Hospital</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#39856D]" /> Relief Centre</span>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] text-[#697780]">
          <MapPin className="h-3 w-3 text-[#268A87]" />
          Simulated Chennai Flood Demonstration Layer · OpenStreetMap
        </span>
      </div>
    </div>
  );
};

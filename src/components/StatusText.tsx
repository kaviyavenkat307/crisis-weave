import React from 'react';

export const PriorityLabel: React.FC<{ priority: string }> = ({ priority }) => {
  const colorMap: Record<string, string> = {
    Critical: 'text-[#D9534F] font-semibold',
    High: 'text-[#C2781A] font-semibold',
    Medium: 'text-[#268A87] font-medium',
    Low: 'text-[#697780] font-medium',
  };
  return <span className={`text-xs whitespace-nowrap ${colorMap[priority] || 'text-[#697780]'}`}>{priority}</span>;
};

export const VerificationText: React.FC<{ status: string }> = ({ status }) => {
  const colorMap: Record<string, string> = {
    Verified: 'text-[#39856D] font-semibold',
    Delivered: 'text-[#39856D] font-semibold',
    Fulfilled: 'text-[#39856D] font-semibold',
    Cleared: 'text-[#39856D] font-semibold',
    Approved: 'text-[#268A87] font-semibold',
    'In Transit': 'text-[#268A87] font-semibold',
    Dispatched: 'text-[#268A87] font-semibold',
    Preparing: 'text-[#C2781A] font-medium',
    Pending: 'text-[#C2781A] font-medium',
    'Needs Review': 'text-[#C2781A] font-semibold',
    'Duplicate Linked': 'text-[#697780] font-medium',
    Rejected: 'text-[#D9534F] font-semibold',
    Suspicious: 'text-[#D9534F] font-semibold',
    Normal: 'text-[#39856D] font-medium',
  };
  return <span className={`text-xs whitespace-nowrap ${colorMap[status] || 'text-[#697780]'}`}>{status}</span>;
};

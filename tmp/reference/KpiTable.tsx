
import React, { useState } from 'react';
import type { PmsData, KpiDefinition, ReviewStatusType, User } from '../types';

type SortableKpiKeys = 'rating' | 'kpiWeightageScore' | 'kpiWeightage';

interface KpiTableProps {
    kpis: PmsData[];
    isEditing: boolean;
    onUpdateKpi: (sNo: number, field: keyof PmsData, value: string | number) => void;
    onUpdateKpiStatus: (sNo: number, status: 'Active' | 'Pending Update' | 'Needs Review') => void;
    sortConfig: { key: SortableKpiKeys; direction: 'ascending' | 'descending' } | null;
    requestSort: (key: SortableKpiKeys) => void;
    kpiLibrary: KpiDefinition[];
    reviewStatus: ReviewStatusType;
    currentUser: User;
    reportingManagerId: number | null;
    onViewLogic?: (kpi: PmsData) => void;
    onOpenTracker?: (kpi: PmsData) => void; 
    onDeleteKpi?: (sNo: number) => void;
}

const getRatingColor = (rating: number): string => {
    const r = Number(rating) || 0;
    if (r >= 5) return 'text-green-600 bg-green-100';
    if (r >= 4) return 'text-blue-600 bg-blue-100';
    if (r >= 3) return 'text-yellow-600 bg-yellow-100';
    if (r >= 1) return 'text-orange-600 bg-orange-100';
    return 'text-red-600 bg-red-100';
};

const getReviewStatusStyle = (status: string) => {
    switch(status) {
        case 'Self Review': return 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100';
        case 'Manager Check': return 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100';
        case 'Audit': return 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100';
        case 'Approved': return 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100';
        case 'KRA Set': 
        default: return 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200';
    }
};

const EditableCell: React.FC<{ value: string | number, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, type?: string }> = ({ value, onChange, type = 'text' }) => {
    return (
        <input
            type={type}
            value={value}
            onChange={onChange}
            className="w-full px-3 py-2 bg-white text-slate-900 border-2 border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition placeholder-slate-400 font-medium text-center"
        />
    );
};

const FeedbackInputCell: React.FC<{
    achieved: string | number | undefined | null;
    remarks: string | undefined;
    rating: number | null | undefined;
    onAchievedChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onRemarksChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    isEditable: boolean;
    title: string;
}> = ({ achieved, remarks, rating, onAchievedChange, onRemarksChange, isEditable, title }) => {
    
    if (!isEditable && !achieved && !remarks) {
        return <span className="text-slate-400 italic">No input given.</span>;
    }

    return (
        <div className="space-y-3">
            <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Target Achieved</label>
                {isEditable ? (
                    <input
                        type="text"
                        value={achieved ?? ''}
                        onChange={onAchievedChange}
                        aria-label={`${title} Target Achieved`}
                        className="w-full px-3 py-2 bg-white text-slate-900 border-2 border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition placeholder-slate-400 font-medium"
                    />
                ) : (
                    <p className="font-semibold text-slate-800 break-words p-1 bg-slate-50 rounded border border-slate-200">
                        {achieved || <span className="text-slate-400 italic">N/A</span>}
                    </p>
                )}
            </div>

            <div>
                 <label className="block text-xs font-semibold text-slate-600 mb-1">Remarks</label>
                {isEditable ? (
                    <textarea
                        value={remarks ?? ''}
                        onChange={onRemarksChange}
                        rows={3}
                        placeholder={`${title} Remarks...`}
                        className="w-full px-3 py-2 bg-white text-slate-900 border-2 border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition placeholder-slate-400"
                    />
                ) : (
                    <p className="text-sm text-slate-600 break-words whitespace-pre-wrap p-2 bg-slate-50 rounded border border-slate-200 min-h-[2.5rem]">
                        {remarks || <span className="text-slate-400 italic">No remarks.</span>}
                    </p>
                )}
            </div>

            {rating !== null && rating !== undefined && (
                <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-medium text-slate-500">Calculated Rating:</span>
                    <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded border ${getRatingColor(rating)}`}>
                        {rating.toFixed(1)}
                    </span>
                </div>
            )}
        </div>
    );
};


const formatAndRoundAchievedWeight = (value: string | number): string => {
    const sValue = String(value).trim();
    if (sValue === '-' || sValue === 'N/A') return sValue;
    if (sValue.endsWith('%')) {
        const num = parseFloat(sValue.slice(0, -1));
        if (isNaN(num)) return '0.00';
        return (num / 100).toFixed(2);
    }
    const num = parseFloat(sValue);
    if (isNaN(num)) return '0.00';
    return num.toFixed(2);
};

const KpiTableRow: React.FC<{ 
    kpi: PmsData; 
    isEditing: boolean; 
    onUpdateKpi: KpiTableProps['onUpdateKpi']; 
    onUpdateKpiStatus: KpiTableProps['onUpdateKpiStatus'];
    kpiLibrary: KpiDefinition[]; 
    reviewStatus: ReviewStatusType;
    currentUser: User;
    reportingManagerId: number | null;
    onViewLogic?: (kpi: PmsData) => void;
    onOpenTracker?: (kpi: PmsData) => void;
    onDeleteKpi?: (sNo: number) => void;
}> = ({ kpi, isEditing, onUpdateKpi, onUpdateKpiStatus, kpiLibrary, reviewStatus, currentUser, reportingManagerId, onViewLogic, onOpenTracker, onDeleteKpi }) => {
    const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
    const [isReviewStatusMenuOpen, setIsReviewStatusMenuOpen] = useState(false);
    const isNA = String(kpi.targetAchieved).trim().toUpperCase() === 'NA';

    const formatDisplayValue = (value: string | number, uom: string): string => {
        const strValue = String(value).trim();
        if (strValue.toUpperCase() === 'NA' || !strValue) {
            return strValue;
        }
        if (uom === '%' && !strValue.endsWith('%')) {
            return `${strValue}%`;
        }
        return strValue;
    };

    const renderUom = (uom: string) => {
        if (!uom || uom === '%') return null;
        return <span className="text-xs text-slate-500 ml-1 whitespace-nowrap">{uom}</span>;
    };
    
    // N/A Row Logic Modification
    if (isNA && !isEditing) {
        return (
            <tr className="bg-slate-50 text-slate-400">
                <td className="px-4 py-4 break-words align-top">{kpi.category}</td>
                <td className="px-4 py-4 max-w-md align-top">
                    <p className="font-semibold break-words">{kpi.kra}</p>
                    <p className="break-words">{kpi.kpi}</p>
                </td>
                <td className="px-4 py-4 align-top text-center">
                    <div className="flex items-center justify-center">
                        <span className="font-medium text-slate-500">{kpi.target}</span>
                        {renderUom(kpi.uom)}
                    </div>
                </td>
                <td className="px-4 py-4 text-center align-top font-medium text-slate-700">
                     {`${(Number(kpi.kpiWeightage) || 0).toFixed(2)}%`}
                </td>
                <td className="px-4 py-4 text-center italic align-top">N/A</td>
                <td className="px-4 py-4 text-center align-top">
                    <button
                         onClick={() => onOpenTracker && onOpenTracker(kpi)}
                         className="inline-block px-3 py-1 text-sm font-semibold rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors"
                         title="Rated N/A - Click to view Tracker"
                    >
                        Rated: NA
                    </button>
                </td>
                <td className="px-4 py-4 text-center italic align-top">-</td>
                 <td className="px-4 py-4 text-center align-top">
                    <button
                        onClick={() => onOpenTracker && onOpenTracker(kpi)}
                        className="p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 text-slate-600 hover:text-indigo-600 transition-colors"
                        title="Open Detailed KPI Tracker"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    </button>
                 </td>
                <td className="px-4 py-4 align-top text-xs text-slate-600 whitespace-pre-wrap bg-blue-50/20 border-l border-slate-100">
                    <span className="block font-semibold text-slate-500 mb-1 text-[10px] uppercase">Self Review</span>
                    {kpi.employeeRemarks || <span className="italic text-slate-400">No remarks</span>}
                </td>
                <td className="px-4 py-4 align-top text-xs text-slate-600 whitespace-pre-wrap bg-orange-50/20 border-l border-slate-100">
                     <span className="block font-semibold text-slate-500 mb-1 text-[10px] uppercase">Manager</span>
                    {kpi.managerRemarks || <span className="italic text-slate-400">No remarks</span>}
                </td>
                <td className="px-4 py-4 align-top text-xs text-slate-600 whitespace-pre-wrap bg-purple-50/20 border-l border-slate-100">
                     <span className="block font-semibold text-slate-500 mb-1 text-[10px] uppercase">Audit</span>
                     {kpi.auditRemarks || <span className="italic text-slate-400">No remarks</span>}
                </td>
            </tr>
        );
    }
    
    const ratingColor = getRatingColor(kpi.rating);
    const kpiDef = kpiLibrary.find(def => def.category === kpi.category && def.kra === kpi.kra && def.kpi === kpi.kpi);
    
    const isAdmin = currentUser.role === 'admin';
    const isSelf = currentUser.role === 'employee' && kpi.newCode === currentUser.id;
    const isManager = currentUser.role === 'employee' && currentUser.id === reportingManagerId;

    const isTargetEditable = isEditing && isAdmin; 
    
    // Use individual KPI review status if available, fallback to month-level status
    const effectiveReviewStatus = kpi.reviewStatus || reviewStatus;

    const isEmployeeEditable = (effectiveReviewStatus === 'Self Review' && (isSelf || isAdmin));
    const isManagerEditable = (effectiveReviewStatus === 'Manager Check' && (isManager || isAdmin));
    const isAuditEditable = (effectiveReviewStatus === 'Audit' && isAdmin);

    const getStatusColor = (status?: string) => {
        switch(status) {
            case 'Pending Update': return 'bg-orange-500';
            case 'Needs Review': return 'bg-red-500';
            default: return 'bg-green-500';
        }
    };

    const statusColor = getStatusColor(kpi.kpiStatus);
    const reviewStatusBadgeStyle = getReviewStatusStyle(kpi.reviewStatus);

    return (
        <tr className="hover:bg-slate-50">
            <td className="px-4 py-4 break-words align-top">
                <span className="font-medium text-slate-800">{kpi.category}</span>
            </td>
            <td className="px-4 py-4 max-w-md align-top relative group">
                {isEditing && onDeleteKpi && (
                    <button 
                        onClick={() => onDeleteKpi(kpi.sNo)}
                        className="absolute right-2 top-2 p-1 text-red-400 hover:text-red-600 bg-white rounded shadow-sm border border-slate-200 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                        title="Delete KPI"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                             <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                        </svg>
                    </button>
                )}
                <div className="flex items-start gap-2">
                    <div className="relative mt-1">
                        <button
                            type="button"
                            onClick={() => setIsStatusMenuOpen(!isStatusMenuOpen)}
                            className={`w-3 h-3 rounded-full ${statusColor} hover:opacity-80 shadow-sm transition-all flex-shrink-0`}
                            title={`Current KPI Definition Status: ${kpi.kpiStatus || 'Active'}`}
                        />
                        {isStatusMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsStatusMenuOpen(false)}></div>
                                <div className="absolute left-0 top-4 z-50 w-40 bg-white rounded-md shadow-lg border border-slate-200 py-1 text-sm">
                                    <button onClick={() => { onUpdateKpiStatus(kpi.sNo, 'Active'); setIsStatusMenuOpen(false); }} className="block w-full text-left px-4 py-2 hover:bg-green-50 text-slate-700 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500"></span> Active</button>
                                    <button onClick={() => { onUpdateKpiStatus(kpi.sNo, 'Pending Update'); setIsStatusMenuOpen(false); }} className="block w-full text-left px-4 py-2 hover:bg-orange-50 text-slate-700 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-500"></span> Pending Update</button>
                                    <button onClick={() => { onUpdateKpiStatus(kpi.sNo, 'Needs Review'); setIsStatusMenuOpen(false); }} className="block w-full text-left px-4 py-2 hover:bg-red-50 text-slate-700 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500"></span> Needs Review</button>
                                </div>
                            </>
                        )}
                    </div>
                    <div className="flex-1">
                        <div className="flex justify-between items-start gap-2 mb-1">
                            <div>
                                <p className="font-semibold text-slate-800 break-words leading-tight">{kpi.kra}</p>
                            </div>
                            <div className="relative flex-shrink-0">
                                 <button
                                    onClick={() => setIsReviewStatusMenuOpen(!isReviewStatusMenuOpen)}
                                    className={`px-2 py-1 text-[10px] font-bold rounded border uppercase tracking-wide whitespace-nowrap transition-colors ${reviewStatusBadgeStyle}`}
                                    title="Click to change Review Status"
                                 >
                                    {kpi.reviewStatus || 'KRA Set'}
                                 </button>
                                 {isReviewStatusMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setIsReviewStatusMenuOpen(false)}></div>
                                        <div className="absolute right-0 top-6 z-50 w-36 bg-white rounded-md shadow-xl border border-slate-200 py-1 text-xs">
                                             {['KRA Set', 'Self Review', 'Manager Check', 'Audit', 'Approved'].map(status => (
                                                 <button
                                                    key={status}
                                                    onClick={() => { onUpdateKpi(kpi.sNo, 'reviewStatus', status); setIsReviewStatusMenuOpen(false); }}
                                                    className={`block w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 ${kpi.reviewStatus === status ? 'font-bold bg-slate-50' : ''}`}
                                                 >
                                                    {status}
                                                 </button>
                                             ))}
                                        </div>
                                    </>
                                 )}
                            </div>
                        </div>
                        <p className="text-slate-600 break-words">{kpi.kpi}</p>
                        {kpi.kpiCode && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-mono rounded border border-slate-200">
                                {kpi.kpiCode}
                            </span>
                        )}
                        {kpiDef?.description && (
                            <p className="text-xs text-slate-500 mt-1 italic break-words" style={{ whiteSpace: 'pre-wrap' }}>
                                {kpiDef.description}
                            </p>
                        )}
                    </div>
                </div>
            </td>
            <td className="px-4 py-4 align-top text-center">
                {isTargetEditable ? (
                    <EditableCell
                        value={kpi.target}
                        onChange={e => onUpdateKpi(kpi.sNo, 'target', e.target.value)}
                    />
                ) : (
                    <div className="flex flex-col items-center">
                        <div className="flex items-center justify-center">
                             <span className="font-medium">{formatDisplayValue(kpi.target, kpi.uom)}</span>
                             {renderUom(kpi.uom)}
                        </div>
                        <p className="text-[10px] text-slate-400 whitespace-nowrap">({kpi.criteria1})</p>
                    </div>
                )}
            </td>
            <td className="px-4 py-4 text-center align-top">
                {isTargetEditable ? (
                     <EditableCell
                        type="number"
                        value={kpi.kpiWeightage}
                        onChange={e => onUpdateKpi(kpi.sNo, 'kpiWeightage', e.target.value)}
                    />
                ) : (
                    <span className="font-medium text-slate-700">{`${(Number(kpi.kpiWeightage) || 0).toFixed(2)}%`}</span>
                )}
            </td>
            <td className="px-4 py-4 align-top text-center">
                 <div className="flex items-center justify-center">
                     <span className="font-medium">{formatDisplayValue(kpi.targetAchieved, kpi.uom)}</span>
                     {renderUom(kpi.uom)}
                 </div>
            </td>
            <td className="px-4 py-4 text-center align-top">
                <button
                    onClick={() => onViewLogic && onViewLogic(kpi)}
                    className={`inline-block px-3 py-1 text-sm font-semibold rounded-full cursor-pointer hover:opacity-80 hover:shadow-md transition-all ${isNA ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ratingColor}`}
                    disabled={isNA}
                    title="Click to view KRA Logic & Criteria"
                >
                    {isNA ? 'N/A' : (Number(kpi.rating) || 0).toFixed(1)}
                </button>
            </td>
            <td className="px-4 py-4 text-center align-top">
                 <span className={`text-lg font-bold ${isNA ? 'text-slate-400' : 'text-slate-800'}`}>
                    {isNA ? 'N/A' : (Number(kpi.kpiWeightageScore) || 0).toFixed(1)}
                </span>
            </td>
             <td className="px-4 py-4 text-center align-top">
                <button
                    onClick={() => onOpenTracker && onOpenTracker(kpi)}
                    className="p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 text-slate-600 hover:text-indigo-600 transition-colors"
                    title="Open Detailed KPI Tracker"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                </button>
            </td>
             <td className="px-4 py-4 align-top bg-blue-50/30 border-l border-slate-100">
                <FeedbackInputCell
                    title="Employee"
                    achieved={kpi.employeeTargetAchieved}
                    remarks={kpi.employeeRemarks}
                    rating={kpi.employeeRating}
                    onAchievedChange={e => onUpdateKpi(kpi.sNo, 'employeeTargetAchieved', e.target.value)}
                    onRemarksChange={e => onUpdateKpi(kpi.sNo, 'employeeRemarks', e.target.value)}
                    isEditable={isEmployeeEditable}
                />
            </td>
            <td className="px-4 py-4 align-top bg-orange-50/30 border-l border-slate-100">
                <FeedbackInputCell
                    title="Manager"
                    achieved={kpi.managerTargetAchieved}
                    remarks={kpi.managerRemarks}
                    rating={kpi.managerRating}
                    onAchievedChange={e => onUpdateKpi(kpi.sNo, 'managerTargetAchieved', e.target.value)}
                    onRemarksChange={e => onUpdateKpi(kpi.sNo, 'managerRemarks', e.target.value)}
                    isEditable={isManagerEditable}
                />
            </td>
            <td className="px-4 py-4 align-top bg-purple-50/30 border-l border-slate-100">
                <FeedbackInputCell
                    title="Audit/Final"
                    achieved={kpi.auditTargetAchieved}
                    remarks={kpi.auditRemarks}
                    rating={kpi.auditRating}
                    onAchievedChange={e => onUpdateKpi(kpi.sNo, 'auditTargetAchieved', e.target.value)}
                    onRemarksChange={e => onUpdateKpi(kpi.sNo, 'auditRemarks', e.target.value)}
                    isEditable={isAuditEditable}
                />
            </td>
        </tr>
    );
};

const KpiTable: React.FC<KpiTableProps> = ({ 
    kpis, 
    isEditing, 
    onUpdateKpi, 
    onUpdateKpiStatus,
    sortConfig, 
    requestSort, 
    kpiLibrary, 
    reviewStatus,
    currentUser,
    reportingManagerId,
    onViewLogic,
    onOpenTracker,
    onDeleteKpi
}) => {
    const getSortIcon = (key: SortableKpiKeys) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return (
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 inline-block ml-1 transition-transform ${sortConfig.direction === 'descending' ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
        );
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[1800px] table-fixed kpi-table">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-medium">
                    <tr>
                        <th className="px-4 py-3 text-left w-[10%]">Category</th>
                        <th className="px-4 py-3 text-left w-[15%]">KRA & KPI</th>
                        <th className="px-4 py-3 text-center w-[8%]">Target</th>
                        <th 
                            className="px-4 py-3 text-center w-[5%] cursor-pointer hover:bg-slate-100"
                            onClick={() => requestSort('kpiWeightage')}
                        >
                            Weight % {getSortIcon('kpiWeightage')}
                        </th>
                        <th className="px-4 py-3 text-center w-[8%]">Target Achieved</th>
                        <th 
                            className="px-4 py-3 text-center w-[5%] cursor-pointer hover:bg-slate-100"
                            onClick={() => requestSort('rating')}
                        >
                            Rating {getSortIcon('rating')}
                        </th>
                        <th 
                            className="px-4 py-3 text-center w-[5%] cursor-pointer hover:bg-slate-100"
                            onClick={() => requestSort('kpiWeightageScore')}
                        >
                            Score {getSortIcon('kpiWeightageScore')}
                        </th>
                         <th className="px-4 py-3 text-center w-[5%]">Tracker</th>
                         <th className="px-4 py-3 text-left w-[13%] bg-blue-50/50 border-l border-slate-200">
                            Employee Self Review
                        </th>
                         <th className="px-4 py-3 text-left w-[13%] bg-orange-50/50 border-l border-slate-200">
                            Manager Assessment
                        </th>
                         <th className="px-4 py-3 text-left w-[13%] bg-purple-50/50 border-l border-slate-200">
                            Audit / Final
                        </th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                    {kpis.map((kpi, index) => (
                        <KpiTableRow 
                            key={kpi.sNo || index} 
                            kpi={kpi} 
                            isEditing={isEditing} 
                            onUpdateKpi={onUpdateKpi} 
                            onUpdateKpiStatus={onUpdateKpiStatus}
                            kpiLibrary={kpiLibrary}
                            reviewStatus={reviewStatus}
                            currentUser={currentUser}
                            reportingManagerId={reportingManagerId}
                            onViewLogic={onViewLogic}
                            onOpenTracker={onOpenTracker}
                            onDeleteKpi={onDeleteKpi}
                        />
                    ))}
                    {kpis.length === 0 && (
                        <tr>
                            <td colSpan={11} className="px-6 py-8 text-center text-slate-500">
                                No KPIs found for this category or search term.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default KpiTable;

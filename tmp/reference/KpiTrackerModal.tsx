
import React, { useMemo, useEffect, useRef } from 'react';
import type { PmsData, User } from '../types';
import type { Chart } from 'chart.js';

interface KpiTrackerModalProps {
    isOpen: boolean;
    onClose: () => void;
    kpi: PmsData | null;
    pmsData: PmsData[];
    onUpdateKpi: (sNo: number, field: keyof PmsData, value: string | number) => void;
    currentUser: User;
}

const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sortMonths = (a: string, b: string): number => {
    const [monthAStr, yearAStr] = a.split('-');
    const [monthBStr, yearBStr] = b.split('-');
    const yearA = parseInt(`20${yearAStr}`, 10);
    const yearB = parseInt(`20${yearBStr}`, 10);
    if (yearA !== yearB) return yearA - yearB;
    const monthAIndex = monthOrder.indexOf(monthAStr);
    const monthBIndex = monthOrder.indexOf(monthBStr);
    return monthAIndex - monthBIndex;
};

const parseChartValue = (val: string | number | undefined | null): number => {
    if (val === undefined || val === null) return 0;
    const str = String(val).trim().toUpperCase();
    if (str === '' || str === '-' || str === 'NA' || str === 'N/A') return 0;
    const cleanStr = str.replace(/[%]/g, '').replace(/,/g, '');
    const num = parseFloat(cleanStr);
    return isNaN(num) ? 0 : num;
};

const KpiTrackerModal: React.FC<KpiTrackerModalProps> = ({ isOpen, onClose, kpi, pmsData, onUpdateKpi, currentUser }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<Chart | null>(null);

    const annualHistory = useMemo(() => {
        if (!kpi) return [];
        return pmsData.filter(d => 
            d.newCode === kpi.newCode &&
            d.category === kpi.category && 
            d.kra === kpi.kra && 
            d.kpi === kpi.kpi
        ).sort((a, b) => sortMonths(a.month, b.month));
    }, [kpi, pmsData]);

    useEffect(() => {
        if (!canvasRef.current || annualHistory.length === 0) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        
        if (typeof (window as any).Chart === 'undefined') return;
        
        if (chartRef.current) {
            chartRef.current.destroy();
        }

        const labels = annualHistory.map(d => d.month);
        const targetData = annualHistory.map(d => parseChartValue(d.target));
        const achievedData = annualHistory.map(d => {
            const officialVal = parseChartValue(d.targetAchieved);
            if (officialVal !== 0) return officialVal;
            return parseChartValue(d.employeeTargetAchieved);
        });

        chartRef.current = new (window as any).Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Target',
                        data: targetData,
                        borderColor: '#64748b',
                        backgroundColor: 'rgba(100, 116, 139, 0.1)',
                        borderWidth: 2,
                        tension: 0.1,
                        fill: false,
                        borderDash: [5, 5]
                    },
                    {
                        label: 'Achieved',
                        data: achievedData,
                        borderColor: '#4f46e5',
                        backgroundColor: 'rgba(79, 70, 229, 0.2)',
                        borderWidth: 3,
                        pointBackgroundColor: '#4f46e5',
                        tension: 0.3,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: '#e2e8f0' } },
                    x: { grid: { display: false } }
                },
                plugins: {
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: (context: any) => {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                if (kpi?.uom === '%') return `${label}: ${value}%`;
                                return `${label}: ${value}`;
                            }
                        }
                    },
                    legend: { position: 'top' }
                }
            }
        });

        return () => {
            if (chartRef.current) chartRef.current.destroy();
        };
    }, [annualHistory, kpi?.uom]);

    if (!isOpen || !kpi) return null;

    const isAdmin = currentUser.role === 'admin';
    const isSelf = currentUser.role === 'employee' && kpi.newCode === currentUser.id;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-start flex-shrink-0">
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold text-slate-800">KPI Tracker Sheet</h2>
                            {kpi.uom && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-bold rounded">{kpi.uom}</span>}
                        </div>
                        <p className="text-slate-600 font-medium mt-1">{kpi.kra}</p>
                        <p className="text-slate-500 text-sm">{kpi.kpi}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm h-72">
                        <h3 className="text-sm font-bold text-slate-500 uppercase mb-2">Annual Performance Trend</h3>
                        <div className="relative h-full w-full pb-6">
                            <canvas ref={canvasRef}></canvas>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-lg font-bold text-slate-800 mb-3">Monthly Detail Log</h3>
                        <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-sm">
                            <table className="w-full min-w-[1000px] text-left border-collapse">
                                <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="px-4 py-3 border-b border-r w-24 text-center bg-slate-50">Month</th>
                                        <th className="px-4 py-3 border-b border-r w-20 text-center bg-slate-50">Target</th>
                                        <th className="px-4 py-3 border-b border-r w-32 text-center bg-blue-50/90 text-blue-900">Achieved</th>
                                        <th className="px-4 py-3 border-b border-r w-16 text-center bg-slate-50">Rating</th>
                                        <th className="px-4 py-3 border-b border-r w-24 text-center bg-slate-50">Status</th>
                                        <th className="px-4 py-3 border-b border-r w-64 bg-yellow-50/90 text-yellow-900">Evidence</th>
                                        <th className="px-4 py-3 border-b border-r w-48 bg-purple-50/90 text-purple-900">Audit Check</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {annualHistory.map((entry) => {
                                        const isEditable = (entry.reviewStatus === 'Self Review' && (isSelf || isAdmin)) || (entry.reviewStatus === 'KRA Set' && isAdmin);
                                        const isAuditEditable = (entry.reviewStatus === 'Audit' && isAdmin) || isAdmin;

                                        return (
                                            <tr key={entry.sNo} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 border-r font-bold text-slate-700 text-center">{entry.month}</td>
                                                <td className="px-4 py-3 border-r text-center font-medium">{entry.target}</td>
                                                <td className="px-4 py-3 border-r bg-blue-50/20 align-top">
                                                    {isEditable ? (
                                                        <input 
                                                            type="text" 
                                                            value={entry.employeeTargetAchieved || ''}
                                                            onChange={(e) => onUpdateKpi(entry.sNo, 'employeeTargetAchieved', e.target.value)}
                                                            className="w-full text-center px-2 py-1 text-sm bg-white border border-slate-300 rounded"
                                                            placeholder="Value"
                                                        />
                                                    ) : (
                                                        <div className="text-center font-semibold text-slate-800">{entry.employeeTargetAchieved || '-'}</div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 border-r text-center font-bold">
                                                    <span className={`px-2 py-1 rounded ${Number(entry.rating) >= 3 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                        {Number(entry.rating).toFixed(1)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 border-r text-center text-xs font-semibold uppercase text-slate-500">{entry.reviewStatus}</td>
                                                <td className="px-4 py-3 border-r bg-yellow-50/20 align-top">
                                                    {isEditable ? (
                                                        <textarea 
                                                            rows={2}
                                                            value={entry.evidence || ''}
                                                            onChange={(e) => onUpdateKpi(entry.sNo, 'evidence', e.target.value)}
                                                            className="w-full px-2 py-1 text-sm bg-white border border-slate-300 rounded"
                                                            placeholder="Proof..."
                                                        />
                                                    ) : (
                                                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{entry.evidence || '-'}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 bg-purple-50/20 align-top">
                                                    {isAuditEditable ? (
                                                        <input 
                                                            type="text" 
                                                            value={entry.auditTargetAchieved || ''}
                                                            onChange={(e) => onUpdateKpi(entry.sNo, 'auditTargetAchieved', e.target.value)}
                                                            className="w-full text-center px-2 py-1 text-xs bg-white border border-purple-200 rounded"
                                                            placeholder="Audit Value"
                                                        />
                                                    ) : (
                                                        <span className="text-xs font-semibold text-slate-700">{entry.auditTargetAchieved || '-'}</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 bg-white text-slate-700 font-semibold border border-slate-300 rounded-lg shadow-sm hover:bg-slate-100 transition-colors">
                        Close Sheet
                    </button>
                </div>
            </div>
        </div>
    );
};

export default KpiTrackerModal;

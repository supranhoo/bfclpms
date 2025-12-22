
import React, { useState, useMemo, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import type { PmsData, KpiDefinition, ReviewStatusType, ManagedEmployee, User } from '../types';
import ProfileCard from './ProfileCard';
import CategoryScoreChart from './CategoryScoreChart';
import FilterButtons from './FilterButtons';
import KpiTable from './KpiTable';
import KRAAcceptancePage from './KRAAcceptancePage';
import KRAHistoryModal from './KRAHistoryModal';
import KpiLogicModal from './KpiLogicModal';
import KpiTrackerModal from './KpiTrackerModal';

// @ts-ignore
import html2canvas from 'html2canvas';
// @ts-ignore
import { jsPDF } from 'jspdf';

interface IndividualDashboardProps {
    employee: ManagedEmployee;
    employeeData: PmsData[];
    isEditing: boolean;
    onUpdateKpi: (sNo: number, field: keyof PmsData, value: string | number) => void;
    onUpdateKpiStatus: (sNo: number, status: 'Active' | 'Pending Update' | 'Needs Review') => void;
    onUpdateReviewStatus: (newStatus: ReviewStatusType, month: string) => void;
    onSyncLogicToFuture?: (kpi: PmsData) => void;
    onAddKpi?: (kpi: PmsData) => void;
    onDeleteKpi?: (sNo: number) => void;
    kpiLibrary: KpiDefinition[];
    selectedMonth: string;
    currentUser: User;
}

export interface IndividualDashboardHandle {
    downloadPDF: () => void;
}

type SortableKpiKeys = 'rating' | 'kpiWeightageScore' | 'kpiWeightage';

const reviewStatusConfig: { [key in ReviewStatusType]: { text: string; color: string; icon?: string } } = {
    'KRA Set': { text: 'KRA Set', color: 'text-slate-600' },
    'Self Review': { text: 'Self Review', color: 'text-blue-600', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
    'Manager Check': { text: 'Manager Check', color: 'text-orange-500', icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542 7-4.477 0-8.268-2.943-9.542-7z' },
    'Audit': { text: 'Audit', color: 'text-purple-600', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    'Approved': { text: 'Approved', color: 'text-green-600', icon: 'M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z' },
};
const reviewStatusOptions: ReviewStatusType[] = ['KRA Set', 'Self Review', 'Manager Check', 'Audit', 'Approved'];

const IndividualDashboard = forwardRef<IndividualDashboardHandle, IndividualDashboardProps>(({ 
    employee,
    employeeData,
    isEditing,
    onUpdateKpi,
    onUpdateKpiStatus,
    onUpdateReviewStatus,
    onSyncLogicToFuture,
    onAddKpi,
    onDeleteKpi,
    kpiLibrary,
    selectedMonth,
    currentUser
}, ref) => {
    const [selectedLocalMonth, setSelectedLocalMonth] = useState<string>(selectedMonth === 'Overall (YTM)' ? 'All Months' : selectedMonth);
    const [activeCategory, setActiveCategory] = useState<string>('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: SortableKpiKeys; direction: 'ascending' | 'descending' } | null>(null);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [viewingKpiLogic, setViewingKpiLogic] = useState<PmsData | null>(null);
    const [viewingKpiTracker, setViewingKpiTracker] = useState<PmsData | null>(null);
    const [isAddKpiModalOpen, setIsAddKpiModalOpen] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    
    const dashboardRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
        downloadPDF: handleDownloadPDF
    }));

    useEffect(() => {
        setSelectedLocalMonth(selectedMonth === 'Overall (YTM)' ? 'All Months' : selectedMonth);
    }, [selectedMonth]);
    
    const locallyFilteredData = useMemo(() => {
        if (selectedLocalMonth === 'All Months') return employeeData;
        return employeeData.filter(d => d.month === selectedLocalMonth);
    }, [employeeData, selectedLocalMonth]);

    const { overallMetrics, categoryMetrics } = useMemo(() => {
        let totalAchievedScore = 0, totalMaxScore = 0, totalKpiWeightage = 0;
        const categories: { [key: string]: { achieved: number; max: number } } = {};
        
        // Group KPIs by (Category + KRA + KPI) to avoid double counting weights in YTM view
        const aggregationMap = new Map<string, PmsData[]>();
        locallyFilteredData.forEach(kpi => {
            const key = `${kpi.category}|${kpi.kra}|${kpi.kpi}`;
            if (!aggregationMap.has(key)) aggregationMap.set(key, []);
            aggregationMap.get(key)!.push(kpi);
        });

        aggregationMap.forEach((instances, key) => {
            const validInstances = instances.filter(kpi => String(kpi.targetAchieved).trim().toUpperCase() !== 'NA');
            if (validInstances.length === 0) return;

            // Use the weight from the latest instance
            const weight = Number(validInstances[0].kpiWeightage) || 0;
            // Average the scores and ratings for the aggregation
            const avgAchieved = validInstances.reduce((sum, k) => sum + (Number(k.kpiWeightageScore) || 0), 0) / validInstances.length;
            
            const cat = validInstances[0].category;
            const max = weight * 5;

            totalAchievedScore += avgAchieved;
            totalMaxScore += max;
            totalKpiWeightage += weight;

            if (!categories[cat]) categories[cat] = { achieved: 0, max: 0 };
            categories[cat].achieved += avgAchieved;
            categories[cat].max += max;
        });

        const overallPercentage = totalMaxScore > 0 ? (totalAchievedScore / totalMaxScore) * 100 : 0;
        const overallRating = totalKpiWeightage > 0 ? totalAchievedScore / totalKpiWeightage : 0;
        
        const calculatedCategoryMetrics = Object.keys(categories).map(catName => ({
            name: catName,
            percentage: categories[catName].max > 0 ? (categories[catName].achieved / categories[catName].max) * 100 : 0
        })).sort((a, b) => b.percentage - a.percentage);

        return { 
            overallMetrics: { totalAchievedScore, totalMaxScore, overallPercentage, overallRating }, 
            categoryMetrics: calculatedCategoryMetrics 
        };
    }, [locallyFilteredData]);

    const sortedKpis = useMemo(() => {
        let kpisToDisplay = [...locallyFilteredData];
        if (activeCategory !== 'All') kpisToDisplay = kpisToDisplay.filter(kpi => kpi.category === activeCategory);
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            kpisToDisplay = kpisToDisplay.filter(kpi => 
                kpi.kra.toLowerCase().includes(term) || kpi.kpi.toLowerCase().includes(term)
            );
        }
        if (sortConfig) {
            kpisToDisplay.sort((a, b) => {
                const aVal = Number(a[sortConfig.key]) || 0;
                const bVal = Number(b[sortConfig.key]) || 0;
                return sortConfig.direction === 'ascending' ? aVal - bVal : bVal - aVal;
            });
        }
        return kpisToDisplay;
    }, [locallyFilteredData, activeCategory, searchTerm, sortConfig]);

    const handleDownloadPDF = async () => {
        if (!dashboardRef.current) return;
        setIsDownloading(true);
        try {
            const canvas = await html2canvas(dashboardRef.current, { scale: 1.5, backgroundColor: '#ffffff', useCORS: true, windowWidth: 1600 });
            const imgData = canvas.toDataURL('image/jpeg', 0.85);
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const imgProps = pdf.getImageProperties(imgData);
            const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight);
            pdf.save(`Scorecard_${employee.fullName}_${selectedLocalMonth}.pdf`);
        } catch (error) { alert("Failed to generate PDF."); } finally { setIsDownloading(false); }
    };

    const isPrivileged = currentUser.role === 'admin' || currentUser.role === 'auditor';
    const employeeProfileData = employeeData[0];
    const currentStatus = locallyFilteredData.length > 0 ? locallyFilteredData[0].reviewStatus : 'Approved';
    const statusInfo = reviewStatusConfig[currentStatus] || reviewStatusConfig['Approved'];

    // Forced Agreement page only for Employees when KRAs are first set
    const shouldShowAcceptancePage = !isPrivileged && selectedLocalMonth !== 'All Months' && currentStatus === 'KRA Set' && !isEditing && locallyFilteredData.length > 0;

    if (shouldShowAcceptancePage) {
        return <KRAAcceptancePage employeeData={locallyFilteredData} onAccept={() => onUpdateReviewStatus('Self Review', selectedLocalMonth)} canAction={true} />;
    }

    return (
        <div className="space-y-8">
            <div ref={dashboardRef} id="individual-dashboard-container" className="bg-slate-50 p-6 rounded-2xl shadow-sm border border-slate-200">
                <section className="mb-8">
                    <ProfileCard employee={employeeProfileData || ({} as PmsData)} onViewHistory={() => setIsHistoryModalOpen(true)} />
                </section>
                
                <section className="mb-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex justify-between items-center mb-2">
                             <h3 className="text-xl font-bold text-slate-800">Performance Overview</h3>
                             <span className={`px-4 py-1.5 rounded-full text-sm font-bold border shadow-sm ${statusInfo.color} bg-white`}>
                                Status: {statusInfo.text}
                             </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                                <span className="text-sm font-bold text-slate-400 uppercase">Overall Rating</span>
                                <div className="flex items-baseline mt-2">
                                    <span className="text-4xl font-black text-slate-800">{overallMetrics.overallRating.toFixed(2)}</span>
                                    <span className="ml-2 text-slate-400 font-bold">/ 5.00</span>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                                <span className="text-sm font-bold text-slate-400 uppercase">Total Weighted Score</span>
                                <div className="flex items-baseline mt-2">
                                    <span className="text-4xl font-black text-indigo-600">{overallMetrics.totalAchievedScore.toFixed(1)}</span>
                                    <span className="ml-2 text-slate-400 font-bold">/ {overallMetrics.totalMaxScore.toFixed(0)}</span>
                                </div>
                                <div className="mt-4 w-full bg-slate-100 rounded-full h-2">
                                    <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${overallMetrics.overallPercentage}%` }}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-[300px]">
                        <h3 className="text-sm font-bold text-slate-400 uppercase mb-4">By Category</h3>
                        <div className="h-[220px]">
                            <CategoryScoreChart data={categoryMetrics} />
                        </div>
                    </div>
                </section>
                
                <section>
                    <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 no-print">
                        <h3 className="text-xl font-bold text-slate-800">Detailed KPI Review</h3>
                        <div className="flex gap-4 w-full md:w-auto">
                            <input type="text" placeholder="Search KRA/KPI..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64" />
                            <FilterButtons categories={categoryMetrics.map(c => c.name)} activeCategory={activeCategory} onSelectCategory={setActiveCategory} />
                        </div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200">
                        <KpiTable 
                            kpis={sortedKpis} 
                            isEditing={isEditing} 
                            onUpdateKpi={onUpdateKpi} 
                            onUpdateKpiStatus={onUpdateKpiStatus} 
                            sortConfig={sortConfig} 
                            requestSort={key => setSortConfig(p => ({ key, direction: p?.key === key && p.direction === 'ascending' ? 'descending' : 'ascending' }))} 
                            kpiLibrary={kpiLibrary} 
                            reviewStatus={currentStatus as ReviewStatusType} 
                            currentUser={currentUser} 
                            reportingManagerId={employee.reportingManagerId} 
                            onViewLogic={setViewingKpiLogic} 
                            onOpenTracker={setViewingKpiTracker} 
                        />
                    </div>
                </section>
            </div>

            {isHistoryModalOpen && <KRAHistoryModal employee={employee} pmsData={employeeData} onClose={() => setIsHistoryModalOpen(false)} />}
            {viewingKpiLogic && <KpiLogicModal isOpen={!!viewingKpiLogic} onClose={() => setViewingKpiLogic(null)} kpi={viewingKpiLogic} isEditing={isEditing} onSave={u => Object.entries(u).forEach(([k, v]) => onUpdateKpi(viewingKpiLogic.sNo, k as any, v as any))} />}
            {viewingKpiTracker && <KpiTrackerModal isOpen={!!viewingKpiTracker} onClose={() => setViewingKpiTracker(null)} kpi={viewingKpiTracker} pmsData={employeeData} onUpdateKpi={onUpdateKpi} currentUser={currentUser} />}
        </div>
    );
});

export default IndividualDashboard;

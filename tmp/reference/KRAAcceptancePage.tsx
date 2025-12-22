
import React, { useState } from 'react';
import type { PmsData } from '../types';
import ProfileCard from './ProfileCard';
import KRAIssuanceTable from './KRAIssuanceTable';

interface KRAAcceptancePageProps {
    employeeData: PmsData[];
    onAccept: () => void;
    canAction: boolean;
}

const KRAAcceptancePage: React.FC<KRAAcceptancePageProps> = ({ employeeData, onAccept, canAction }) => {
    const [confirmedKpis, setConfirmedKpis] = useState<Set<number>>(new Set());
    const employee = employeeData[0];

    const totalWeightage = employeeData.reduce((sum, kpi) => sum + (Number(kpi.kpiWeightage) || 0), 0);

    const handleToggleKpiConfirmation = (sNo: number) => {
        setConfirmedKpis(prev => {
            const newSet = new Set(prev);
            if (newSet.has(sNo)) {
                newSet.delete(sNo);
            } else {
                newSet.add(sNo);
            }
            return newSet;
        });
    };

    const areAllConfirmed = employeeData.length > 0 && confirmedKpis.size === employeeData.length;

    const handleToggleSelectAll = () => {
        if (areAllConfirmed) {
            setConfirmedKpis(new Set());
        } else {
            setConfirmedKpis(new Set(employeeData.map(kpi => kpi.sNo)));
        }
    };

    return (
        <div className="space-y-8">
            <section id="kra-acceptance-header" className="text-center">
                 <h2 className="text-3xl font-bold text-slate-800">Key Responsibility Area (KRA) Agreement</h2>
                 <p className="text-lg text-slate-600 mt-2">
                    For the period of <span className="font-semibold">{employee.month}</span>
                 </p>
                 <p className="mt-1 text-slate-500">Please review the following KRAs and KPIs assigned to you. Once reviewed, please accept them at the bottom of the page.</p>
            </section>

            <section id="profile-section">
                <ProfileCard employee={employee} />
            </section>
            
            <section id="kra-details">
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <KRAIssuanceTable
                        kpis={employeeData}
                        isAcceptanceMode={true}
                        confirmedKpis={confirmedKpis}
                        onToggleConfirmation={handleToggleKpiConfirmation}
                        onToggleSelectAll={handleToggleSelectAll}
                        areAllConfirmed={areAllConfirmed}
                    />
                    <div className="bg-slate-50 p-4 text-right">
                        <span className="text-lg font-bold text-slate-800">
                            Total Weightage: {totalWeightage.toFixed(2)}%
                        </span>
                    </div>
                </div>
            </section>

            <section id="acceptance-section" className="bg-white p-6 rounded-xl shadow-sm">
                <h3 className="text-xl font-bold text-slate-800 mb-2">Acceptance & Confirmation</h3>
                <p className="text-slate-600 mb-6">
                    Please review and confirm each KRA by checking the box next to it. Once all KRAs are confirmed, you can accept the agreement. By clicking "Accept Agreement", you confirm that you have reviewed, understood, and agree to all confirmed KRAs and KPIs.
                </p>
                <div className="text-center">
                    {canAction ? (
                        <button 
                            onClick={onAccept}
                            disabled={!areAllConfirmed}
                            className="px-8 py-3 bg-green-600 text-white font-bold rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75 transition-all disabled:bg-slate-300 disabled:cursor-not-allowed disabled:shadow-none"
                        >
                            Accept Agreement ({confirmedKpis.size}/{employeeData.length} Confirmed)
                        </button>
                    ) : (
                         <div className="p-4 bg-yellow-50 text-yellow-800 rounded border border-yellow-200 inline-block">
                            Only the employee can accept this agreement.
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
};

export default KRAAcceptancePage;

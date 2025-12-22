

import React from 'react';
import type { PmsData } from '../types';

interface ProfileCardProps {
    employee: PmsData;
    // FIX: Made onViewHistory optional to fix a missing property error when this component is used in KRAAcceptancePage.tsx.
    onViewHistory?: () => void;
}

const ProfileCard: React.FC<ProfileCardProps> = ({ employee, onViewHistory }) => {
    return (
        <div className="bg-white p-6 rounded-xl shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
                <h2 className="text-xl font-bold text-slate-900 mb-2 sm:mb-0">Employee Profile</h2>
                {/* FIX: Conditionally render the button only if the onViewHistory prop is provided. */}
                {onViewHistory && (
                    <button
                        onClick={onViewHistory}
                        className="flex items-center px-4 py-2 bg-white text-slate-700 border border-slate-300 font-semibold rounded-lg shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-75"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 transition-none" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                        </svg>
                        View History
                    </button>
                )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                    <span className="block text-sm font-medium text-slate-500">Full Name</span>
                    <span className="text-md font-semibold text-slate-800">{employee.fullName}</span>
                </div>
                <div>
                    <span className="block text-sm font-medium text-slate-500">Designation</span>
                    <span className="text-md font-semibold text-slate-800">{employee.designation}</span>
                </div>
                <div>
                    <span className="block text-sm font-medium text-slate-500">Department</span>
                    <span className="text-md font-semibold text-slate-800">{employee.dept}</span>
                </div>
                <div>
                    <span className="block text-sm font-medium text-slate-500">Division</span>
                    <span className="text-md font-semibold text-slate-800">{employee.division}</span>
                </div>
            </div>
        </div>
    );
};

export default ProfileCard;
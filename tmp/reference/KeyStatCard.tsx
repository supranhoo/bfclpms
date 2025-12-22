import React from 'react';

interface KeyStatCardProps {
    title: string;
    value: string;
    valueColor?: string;
}

const KeyStatCard: React.FC<KeyStatCardProps> = ({ title, value, valueColor = 'text-slate-900' }) => {
    // Special handling for "Total Score" to split it into two lines for better visual layout.
    const isTotalScore = title === 'Total Score' && value.includes('/');
    const valueParts = isTotalScore ? value.split('/') : [value];

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm flex flex-col">
            <span className="block text-base font-medium text-slate-500">{title}</span>
            <div className={`mt-auto font-bold text-3xl leading-tight ${valueColor}`}>
                {isTotalScore ? (
                    <>
                        <span>{valueParts[0].trim()} /</span>
                        <span className="block">{valueParts[1].trim()}</span>
                    </>
                ) : (
                    <span>{value}</span>
                )}
            </div>
        </div>
    );
};

export default KeyStatCard;
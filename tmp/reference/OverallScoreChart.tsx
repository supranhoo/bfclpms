
import React, { useEffect, useRef } from 'react';
import { Chart, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js';

Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

interface OverallScoreChartProps {
    percentage: number;
}

const OverallScoreChart: React.FC<OverallScoreChartProps> = ({ percentage }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<Chart | null>(null);

    useEffect(() => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        
        if (chartRef.current) {
            chartRef.current.destroy();
        }

        const scoreColor = percentage > 90 ? '#4CAF50' : percentage < 60 ? '#F44336' : '#FFC107';

        chartRef.current = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Achieved', 'Remaining'],
                datasets: [{
                    data: [percentage, 100 - percentage],
                    backgroundColor: [scoreColor, '#e5e7eb'],
                    borderColor: '#ffffff',
                    borderWidth: 4,
                    cutout: '75%',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false },
                },
            }
        });

        return () => chartRef.current?.destroy();
    }, [percentage]);

    return (
        <div className="absolute inset-0 flex items-center justify-center">
            <canvas ref={canvasRef}></canvas>
            <div className="absolute text-center pointer-events-none">
                <span className="text-2xl font-bold text-slate-800">{percentage.toFixed(1)}%</span>
            </div>
        </div>
    );
};

export default OverallScoreChart;

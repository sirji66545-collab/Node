/**
 * OSINT Hub - Dashboard JavaScript
 * Complete dashboard functionality with all features
 */

// ============ CONFIGURATION ============
const CONFIG = {
    refreshInterval: 30000, // 30 seconds
    apiBase: '/admin/api'
};

// ============ DOM READY ============
document.addEventListener('DOMContentLoaded', function() {
    console.log('📊 Dashboard initialized');
    
    // Load all dashboard data
    loadDashboardStats();
    loadRecentActivity();
    loadAPIUsageChart();
    loadTopAPIs();
    loadKeyStatus();
    
    // Auto-refresh every 30 seconds
    setInterval(() => {
        loadDashboardStats();
        loadRecentActivity();
    }, CONFIG.refreshInterval);
    
    // Event listeners
    setupEventListeners();
});

// ============ DASHBOARD STATS ============
function loadDashboardStats() {
    fetch('/admin/api/stats')
        .then(res => res.json())
        .then(data => {
            document.getElementById('totalCalls')?.textContent = formatNumber(data.totalCalls || 0);
            document.getElementById('totalKeys')?.textContent = formatNumber(data.totalKeys || 0);
            document.getElementById('activeKeys')?.textContent = formatNumber(data.activeKeys || 0);
            document.getElementById('totalUsers')?.textContent = formatNumber(data.totalUsers || 0);
            document.getElementById('todayCalls')?.textContent = formatNumber(data.todayCalls || 0);
            document.getElementById('totalApis')?.textContent = formatNumber(data.totalApis || 0);
            
            updateProgressBars(data);
        })
        .catch(err => console.error('Error loading stats:', err));
}

// ============ RECENT ACTIVITY ============
function loadRecentActivity() {
    fetch('/admin/api/recent-activity')
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('recentActivity');
            if (!container) return;
            
            if (data.length === 0) {
                container.innerHTML = `<tr><td colspan="4" class="text-center">No recent activity</td></tr>`;
                return;
            }
            
            container.innerHTML = data.slice(0, 10).map(item => `
                <tr>
                    <td><span class="badge badge-${item.status_code === 200 ? 'success' : 'danger'}">${item.status_code || '200'}</span></td>
                    <td><code>${item.api_key || 'N/A'}</code></td>
                    <td>${item.endpoint || 'Unknown'}</td>
                    <td>${formatTime(item.timestamp || item.date)}</td>
                </tr>
            `).join('');
        })
        .catch(err => console.error('Error loading activity:', err));
}

// ============ API USAGE CHART ============
function loadAPIUsageChart() {
    fetch('/admin/api/usage-chart')
        .then(res => res.json())
        .then(data => {
            const canvas = document.getElementById('apiChart');
            if (!canvas) return;
            
            if (typeof Chart === 'undefined') {
                console.warn('Chart.js not loaded');
                return;
            }
            
            const ctx = canvas.getContext('2d');
            
            if (window.apiChart) {
                window.apiChart.destroy();
            }
            
            const isDark = document.body.classList.contains('dark-theme');
            const textColor = isDark ? '#e0e0e0' : '#333';
            
            window.apiChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.labels || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                    datasets: [{
                        label: 'API Calls',
                        data: data.values || [0, 0, 0, 0, 0, 0, 0],
                        borderColor: '#4f46e5',
                        backgroundColor: 'rgba(79, 70, 229, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { 
                                stepSize: 1,
                                color: textColor
                            },
                            grid: { color: isDark ? '#2a3a5e' : '#eee' }
                        },
                        x: {
                            ticks: { color: textColor },
                            grid: { color: isDark ? '#2a3a5e' : '#eee' }
                        }
                    }
                }
            });
        })
        .catch(err => console.error('Error loading chart:', err));
}

// ============ TOP APIS ============
function loadTopAPIs() {
    fetch('/admin/api/top-apis')
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('topAPIs');
            if (!container) return;
            
            if (data.length === 0) {
                container.innerHTML = `<tr><td colspan="3" class="text-center">No API usage data</td></tr>`;
                return;
            }
            
            container.innerHTML = data.slice(0, 10).map((item, index) => `
                <tr>
                    <td>#${index + 1}</td>
                    <td>${item.endpoint || 'Unknown'}</td>
                    <td><span class="badge badge-primary">${formatNumber(item.count || 0)}</span></td>
                </tr>
            `).join('');
        })
        .catch(err => console.error('Error loading top APIs:', err));
}

// ============ KEY STATUS ============
function loadKeyStatus() {
    fetch('/admin/api/key-status')
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('keyStatus');
            if (!container) return;
            
            if (data.length === 0) {
                container.innerHTML = `<tr><td colspan="4" class="text-center">No API keys</td></tr>`;
                return;
            }
            
            container.innerHTML = data.slice(0, 10).map(item => `
                <tr>
                    <td><code>${item.key || 'N/A'}</code></td>
                    <td>${item.name || 'Unnamed'}</td>
                    <td>${formatNumber(item.hits || 0)}</td>
                    <td><span class="status-badge status-${item.status || 'active'}">${item.status || 'active'}</span></td>
                </tr>
            `).join('');
        })
        .catch(err => console.error('Error loading key status:', err));
}

// ============ HELPER FUNCTIONS ============

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function formatTime(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return date.toLocaleDateString();
}

function updateProgressBars(data) {
    const maxCalls = data.maxCalls || 1000;
    const todayCalls = data.todayCalls || 0;
    const percentage = Math.min((todayCalls / maxCalls) * 100, 100);
    
    const progressBar = document.getElementById('usageProgress');
    if (progressBar) {
        progressBar.style.width = percentage + '%';
        progressBar.textContent = Math.round(percentage) + '%';
    }
}

function showError(message) {
    const container = document.getElementById('errorContainer');
    if (!container) return;
    
    container.innerHTML = `
        <div class="alert alert-danger alert-dismissible fade show">
            <i class="fas fa-exclamation-circle"></i> ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    setTimeout(() => { container.innerHTML = ''; }, 5000);
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
    document.getElementById('refreshBtn')?.addEventListener('click', function() {
        this.disabled = true;
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        
        loadDashboardStats();
        loadRecentActivity();
        loadAPIUsageChart();
        loadTopAPIs();
        loadKeyStatus();
        
        setTimeout(() => {
            this.disabled = false;
            this.innerHTML = '<i class="fas fa-sync"></i> Refresh';
        }, 2000);
    });
    
    document.getElementById('exportBtn')?.addEventListener('click', exportDashboardData);
}

// ============ EXPORT FUNCTION ============
function exportDashboardData() {
    fetch('/admin/api/export-data')
        .then(res => res.json())
        .then(data => {
            const headers = ['Date', 'API Key', 'Endpoint', 'Status', 'IP'];
            const rows = data.map(item => [
                item.date || item.timestamp || 'N/A',
                item.api_key || 'N/A',
                item.endpoint || 'N/A',
                item.status_code || 'OK',
                item.ip_address || 'N/A'
            ]);
            
            const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
            
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dashboard-export-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        })
        .catch(err => {
            console.error('Error exporting data:', err);
            showError('Failed to export data');
        });
}

// ============ THEME TOGGLE ============
function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    
    if (window.apiChart) {
        window.apiChart.update();
    }
}

// ============ SIDEBAR TOGGLE ============
function toggleSidebar() {
    document.querySelector('.sidebar')?.classList.toggle('open');
}

// ============ KEYBOARD SHORTCUTS ============
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        document.getElementById('refreshBtn')?.click();
    }
    if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        document.getElementById('exportBtn')?.click();
    }
});

// ============ LOAD SAVED THEME ============
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
}

// ============ CSS STYLES ============
const style = document.createElement('style');
style.textContent = `
    .status-badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .status-active { background: #10b981; color: white; }
    .status-disabled { background: #ef4444; color: white; }
    .status-expired { background: #f59e0b; color: white; }
    .badge { padding: 4px 12px; border-radius: 4px; font-size: 12px; }
    .badge-success { background: #10b981; color: white; }
    .badge-danger { background: #ef4444; color: white; }
    .badge-primary { background: #3b82f6; color: white; }
    .badge-warning { background: #f59e0b; color: white; }
    .text-center { text-align: center; }
`;
document.head.appendChild(style);

console.log('✅ Dashboard.js loaded successfully');

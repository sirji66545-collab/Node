// Dashboard Analytics
function loadDashboardStats() {
    // Fetch stats from API
    fetch('/api/stats')
        .then(res => res.json())
        .then(data => {
            document.getElementById('totalCalls').textContent = data.totalCalls || 0;
            document.getElementById('activeUsers').textContent = data.activeUsers || 0;
            document.getElementById('apiKeys').textContent = data.apiKeys || 0;
        })
        .catch(err => console.error('Error loading stats:', err));
}

// Call on load
document.addEventListener('DOMContentLoaded', loadDashboardStats);

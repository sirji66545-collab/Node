// Main JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    // Initialize any other components
    console.log('OSINT Hub loaded');
});

// Utility function for formatting dates
function formatDate(date) {
    return new Date(date).toLocaleString();
}

// Utility function for copying to clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
        .then(() => alert('Copied to clipboard!'))
        .catch(() => alert('Failed to copy'));
}

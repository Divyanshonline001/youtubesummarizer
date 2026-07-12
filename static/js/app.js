document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    
    // Sidebar & Layout Toggles
    const appSidebar = document.getElementById('appSidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebarOpenBtn = document.getElementById('sidebarOpenBtn');
    const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
    const sidebarRecentList = document.getElementById('sidebarRecentList');
    const themeToggleBtn = document.getElementById('themeToggle');
    const htmlElement = document.documentElement;
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    // Summarizer Form & Warning
    const summarizeForm = document.getElementById('summarizeForm');
    const videoUrlInput = document.getElementById('videoUrl');
    const submitBtn = document.getElementById('submitBtn');
    const configWarning = document.getElementById('configWarning');
    
    // Dashboard Sections
    const featuresSection = document.getElementById('featuresSection');
    const loadingSection = document.getElementById('loadingSection');
    const errorSection = document.getElementById('errorSection');
    const resultsSection = document.getElementById('resultsSection');
    
    // Dashboard Status & Errors
    const loaderStatus = document.getElementById('loaderStatus');
    const errorMessage = document.getElementById('errorMessage');
    
    // Active Results Rendering
    const videoThumbnail = document.getElementById('videoThumbnail');
    const videoTitle = document.getElementById('videoTitle');
    const videoUrlLink = document.getElementById('videoUrlLink');
    const videoUrlText = document.getElementById('videoUrlText');
    const favoriteBtn = document.getElementById('favoriteBtn');
    
    const summaryText = document.getElementById('summaryText');
    const takeawayText = document.getElementById('takeawayText');
    const keyPointsList = document.getElementById('keyPointsList');
    const keyPointsText = document.getElementById('keyPointsText');
    
    // Action Buttons
    const copyBtns = document.querySelectorAll('.copy-btn');
    const copyAllBtn = document.getElementById('copyAllBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const newSummaryBtn = document.getElementById('newSummaryBtn');
    const tryAgainBtn = document.getElementById('tryAgainBtn');
    
    // History & Favorites Tab Views
    const historySearch = document.getElementById('historySearch');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const historyGrid = document.getElementById('historyGrid');
    
    const favoritesSearch = document.getElementById('favoritesSearch');
    const favoritesGrid = document.getElementById('favoritesGrid');
    
    // Toasts
    const toastContainer = document.getElementById('toastContainer');

    // --- Auth DOM Elements ---
    const sidebarAuthBtn = document.getElementById('sidebarAuthBtn');
    const sidebarProfileCard = document.getElementById('sidebarProfileCard');
    const profileUsername = document.getElementById('profileUsername');
    const logoutBtn = document.getElementById('logoutBtn');
    const toggleLoginBtn = document.getElementById('toggleLoginBtn');
    const toggleSignupBtn = document.getElementById('toggleSignupBtn');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const loginErrorBanner = document.getElementById('loginErrorBanner');
    const signupErrorBanner = document.getElementById('signupErrorBanner');
    
    const loginUsernameInput = document.getElementById('loginUsername');
    const loginPasswordInput = document.getElementById('loginPassword');
    const signupUsernameInput = document.getElementById('signupUsername');
    const signupPasswordInput = document.getElementById('signupPassword');
    const signupPasswordConfirmInput = document.getElementById('signupPasswordConfirm');

    // --- State Variables ---
    let currentSummaryData = null;
    let loadingInterval = null;
    let historyList = [];
    let favoritesList = [];
    let isLoggedIn = false;
    let currentUser = null;

    // --- 1. Check Auth Status & Load Caches ---
    async function checkAuthStatusAndLoad() {
        try {
            const res = await fetch('/api/auth/status');
            if (res.ok) {
                const data = await res.json();
                if (data.logged_in) {
                    isLoggedIn = true;
                    currentUser = data.username;
                    updateAuthUI(true, data.username);
                    await loadUserHistoryAndFavorites();
                    return;
                }
            }
        } catch (err) {
            console.error('Auth check failed:', err);
        }
        
        // Fallback to Guest Mode (LocalStorage)
        isLoggedIn = false;
        currentUser = null;
        updateAuthUI(false);
        loadLocalStorageCaches();
    }

    function loadLocalStorageCaches() {
        try {
            historyList = JSON.parse(localStorage.getItem('scribetube_history')) || [];
            favoritesList = JSON.parse(localStorage.getItem('scribetube_favorites')) || [];
        } catch (e) {
            console.error('Failed to parse localStorage history caches, resetting list.', e);
            historyList = [];
            favoritesList = [];
        }
        renderHistoryTab();
        renderFavoritesTab();
        renderSidebarRecentList();
    }

    async function loadUserHistoryAndFavorites() {
        try {
            const res = await fetch('/api/user/history');
            if (res.ok) {
                const data = await res.json();
                historyList = data;
                favoritesList = data.filter(item => item.is_favorite);
            } else {
                throw new Error('Failed to load user history');
            }
        } catch (err) {
            console.error(err);
            showToast('Failed to load history from database.', 'error');
            loadLocalStorageCaches();
            return;
        }
        renderHistoryTab();
        renderFavoritesTab();
        renderSidebarRecentList();
    }

    function updateAuthUI(loggedIn, username = '') {
        if (loggedIn) {
            if (sidebarAuthBtn) sidebarAuthBtn.classList.add('hidden');
            if (sidebarProfileCard) sidebarProfileCard.classList.remove('hidden');
            if (profileUsername) profileUsername.textContent = username;
        } else {
            if (sidebarAuthBtn) sidebarAuthBtn.classList.remove('hidden');
            if (sidebarProfileCard) sidebarProfileCard.classList.add('hidden');
        }
    }

    // --- 2. Theme Configuration ---
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        htmlElement.setAttribute('data-theme', savedTheme);
    } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        htmlElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = htmlElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        htmlElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        showToast(`Switched to ${newTheme === 'dark' ? 'Dark' : 'Light'} Mode`, 'info');
    });

    // --- 3. Sidebar Responsive Drawer Toggles ---
    sidebarOpenBtn.addEventListener('click', () => {
        appSidebar.classList.add('open');
        sidebarOverlay.classList.add('active');
    });

    const closeSidebarDrawer = () => {
        appSidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
    };

    sidebarCloseBtn.addEventListener('click', closeSidebarDrawer);
    sidebarOverlay.addEventListener('click', closeSidebarDrawer);

    // --- 4. Sidebar Nav Panel Switches ---
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTabId = item.getAttribute('data-tab');
            
            switchTab(targetTabId);
            closeSidebarDrawer();
        });
    });

    function switchTab(targetTabId) {
        // Toggle Sidebar Nav States
        navItems.forEach(item => {
            if (item.getAttribute('data-tab') === targetTabId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Toggle Tab Panes visibility
        tabContents.forEach(tab => {
            if (tab.id === targetTabId) {
                tab.classList.remove('hidden');
                tab.classList.add('active');
            } else {
                tab.classList.add('hidden');
                tab.classList.remove('active');
            }
        });

        // Scroll back to top on tab switch
        window.scrollTo({ top: 0, behavior: 'instant' });
    }

    // --- 4b. Authentication & Data Syncing Event Listeners ---
    
    // Toggle between Sign In and Create Account forms
    if (toggleLoginBtn && toggleSignupBtn) {
        toggleLoginBtn.addEventListener('click', () => {
            toggleLoginBtn.classList.add('active');
            toggleSignupBtn.classList.remove('active');
            loginForm.classList.remove('hidden');
            loginForm.classList.add('active');
            signupForm.classList.add('hidden');
            signupForm.classList.remove('active');
            loginErrorBanner.classList.add('hidden');
            signupErrorBanner.classList.add('hidden');
        });

        toggleSignupBtn.addEventListener('click', () => {
            toggleSignupBtn.classList.add('active');
            toggleLoginBtn.classList.remove('active');
            signupForm.classList.remove('hidden');
            signupForm.classList.add('active');
            loginForm.classList.add('hidden');
            loginForm.classList.remove('active');
            loginErrorBanner.classList.add('hidden');
            signupErrorBanner.classList.add('hidden');
        });
    }

    // Submit Login form
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = loginUsernameInput.value.trim();
            const password = loginPasswordInput.value.trim();
            
            if (loginErrorBanner) loginErrorBanner.classList.add('hidden');
            
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (res.ok) {
                    isLoggedIn = true;
                    currentUser = data.username;
                    updateAuthUI(true, data.username);
                    showToast(`Welcome back, ${data.username}!`, 'success');
                    
                    loginUsernameInput.value = '';
                    loginPasswordInput.value = '';
                    
                    // Sync local guest data to DB, then fetch updated list
                    await syncLocalStorageToServer();
                    await loadUserHistoryAndFavorites();
                    
                    switchTab('homeTab');
                } else {
                    if (loginErrorBanner) {
                        loginErrorBanner.querySelector('.error-text').textContent = data.error || 'Invalid credentials.';
                        loginErrorBanner.classList.remove('hidden');
                    }
                }
            } catch (err) {
                console.error(err);
                if (loginErrorBanner) {
                    loginErrorBanner.querySelector('.error-text').textContent = 'A connection error occurred.';
                    loginErrorBanner.classList.remove('hidden');
                }
            }
        });
    }

    // Submit Signup Form
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = signupUsernameInput.value.trim();
            const password = signupPasswordInput.value.trim();
            const confirmPassword = signupPasswordConfirmInput.value.trim();
            
            if (signupErrorBanner) signupErrorBanner.classList.add('hidden');
            
            if (password !== confirmPassword) {
                if (signupErrorBanner) {
                    signupErrorBanner.querySelector('.error-text').textContent = 'Passwords do not match.';
                    signupErrorBanner.classList.remove('hidden');
                }
                return;
            }
            
            try {
                const res = await fetch('/api/auth/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (res.ok) {
                    isLoggedIn = true;
                    currentUser = data.username;
                    updateAuthUI(true, data.username);
                    showToast('Account created successfully!', 'success');
                    
                    signupUsernameInput.value = '';
                    signupPasswordInput.value = '';
                    signupPasswordConfirmInput.value = '';
                    
                    // Sync local guest data to DB, then fetch updated list
                    await syncLocalStorageToServer();
                    await loadUserHistoryAndFavorites();
                    
                    switchTab('homeTab');
                } else {
                    if (signupErrorBanner) {
                        signupErrorBanner.querySelector('.error-text').textContent = data.error || 'Failed to create account.';
                        signupErrorBanner.classList.remove('hidden');
                    }
                }
            } catch (err) {
                console.error(err);
                if (signupErrorBanner) {
                    signupErrorBanner.querySelector('.error-text').textContent = 'A connection error occurred.';
                    signupErrorBanner.classList.remove('hidden');
                }
            }
        });
    }

    // Logout Click
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to sign out?')) return;
            
            try {
                const res = await fetch('/api/auth/logout', { method: 'POST' });
                if (res.ok) {
                    isLoggedIn = false;
                    currentUser = null;
                    updateAuthUI(false);
                    historyList = [];
                    favoritesList = [];
                    
                    // Load local caches back (if any)
                    loadLocalStorageCaches();
                    
                    showToast('Signed out successfully.', 'info');
                    switchTab('homeTab');
                }
            } catch (err) {
                console.error('Logout failed:', err);
                showToast('Failed to sign out.', 'error');
            }
        });
    }

    // Synchronize localStorage history and favorites to the database
    async function syncLocalStorageToServer() {
        const guestHistory = JSON.parse(localStorage.getItem('scribetube_history')) || [];
        const guestFavorites = JSON.parse(localStorage.getItem('scribetube_favorites')) || [];
        
        // Merge guestFavorites into guestHistory is_favorite flag
        const mergedData = guestHistory.map(item => {
            const isFav = guestFavorites.some(fav => fav.videoId === item.videoId);
            return { ...item, is_favorite: isFav };
        });
        
        // Add any favorites not in history
        guestFavorites.forEach(fav => {
            if (!mergedData.some(item => item.videoId === fav.videoId)) {
                mergedData.push({ ...fav, is_favorite: true });
            }
        });
        
        if (mergedData.length === 0) return;
        
        try {
            const res = await fetch('/api/user/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mergedData)
            });
            if (res.ok) {
                // Clear local caches since they are now merged in the DB
                localStorage.removeItem('scribetube_history');
                localStorage.removeItem('scribetube_favorites');
                console.log('Guest history synchronized successfully.');
            }
        } catch (err) {
            console.error('Failed to sync guest data:', err);
        }
    }

    // --- 5. Check Backend API Configuration ---
    async function checkApiConfig() {
        try {
            const res = await fetch('/api/config-check');
            if (res.ok) {
                const data = await res.json();
                if (!data.configured) {
                    configWarning.classList.remove('hidden');
                } else {
                    configWarning.classList.add('hidden');
                }
            }
        } catch (err) {
            console.error('Failed to check API config status:', err);
        }
    }
    checkApiConfig();

    // --- 6. Form Submission & API Calls ---
    summarizeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const url = videoUrlInput.value.trim();
        if (!url) return;

        if (!validateYoutubeUrl(url)) {
            showToast('Invalid YouTube URL format. Please paste a valid link.', 'error');
            return;
        }

        // Trigger Loading state
        showSection(loadingSection);
        startLoadingStatusRotation();
        submitBtn.disabled = true;
        
        try {
            const response = await fetch('/api/summarize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url })
            });

            const data = await response.json();

            if (response.ok) {
                currentSummaryData = data;
                
                // Add timestamp and insert into History array
                data.timestamp = new Date().toISOString();
                saveToHistory(data);
                
                renderResults(data);
                showSection(resultsSection);
                showToast('Summary generated successfully!', 'success');
            } else {
                throw new Error(data.error || 'Failed to generate summary.');
            }
        } catch (err) {
            console.error(err);
            errorMessage.textContent = err.message || 'An unexpected error occurred.';
            showSection(errorSection);
            showToast('Summarization failed.', 'error');
            checkApiConfig();
        } finally {
            submitBtn.disabled = false;
            stopLoadingStatusRotation();
        }
    });

    // Helper functions for youtube links
    function extractVideoId(url) {
        const pattern = /(?:https?:\/\/)?(?:www\.)?(?:m\.)?(?:music\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|live)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(pattern);
        return match ? match[1] : null;
    }

    function validateYoutubeUrl(url) {
        return extractVideoId(url) !== null;
    }

    // Status message cycling
    function startLoadingStatusRotation() {
        const statuses = [
            'Extracting video transcript...',
            'Scraping subtitle timelines...',
            'Analyzing transcript core content...',
            'Running AI models on semantic sections...',
            'Structuring executive summaries...',
            'Drafting bullet insights...',
            'Extracting final takeaways...',
            'Wrapping output layout...'
        ];
        
        let currentIdx = 0;
        loaderStatus.textContent = statuses[currentIdx];
        
        loadingInterval = setInterval(() => {
            currentIdx = (currentIdx + 1) % statuses.length;
            loaderStatus.textContent = statuses[currentIdx];
        }, 3000);
    }

    function stopLoadingStatusRotation() {
        if (loadingInterval) {
            clearInterval(loadingInterval);
            loadingInterval = null;
        }
    }

    // Show Home dashboard sections
    function showSection(sectionToShow) {
        const sections = [featuresSection, loadingSection, errorSection, resultsSection];
        sections.forEach(section => {
            if (section === sectionToShow) {
                section.classList.remove('hidden');
            } else {
                section.classList.add('hidden');
            }
        });
    }

    // --- 7. Save and Manage History Local Cache ---
    function saveToHistory(summaryItem) {
        // Prevent duplicate entries in history (removes old occurrences of the same video ID)
        historyList = historyList.filter(item => item.videoId !== summaryItem.videoId);
        historyList.unshift(summaryItem);
        
        if (isLoggedIn) {
            // Already saved to DB by Flask backend on API call.
            // Just update client list and render.
            renderHistoryTab();
            renderSidebarRecentList();
        } else {
            localStorage.setItem('scribetube_history', JSON.stringify(historyList));
            renderHistoryTab();
            renderSidebarRecentList();
        }
    }

    async function deleteFromHistory(videoId) {
        historyList = historyList.filter(item => item.videoId !== videoId);
        
        if (isLoggedIn) {
            try {
                const res = await fetch(`/api/user/history/${videoId}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('Database delete failed');
            } catch (err) {
                console.error(err);
                showToast('Failed to delete summary from cloud.', 'error');
            }
        } else {
            localStorage.setItem('scribetube_history', JSON.stringify(historyList));
        }
        
        renderHistoryTab();
        renderSidebarRecentList();
        showToast('Summary removed from history.', 'info');
    }

    async function clearAllHistory() {
        if (historyList.length === 0) {
            showToast('History is already empty.', 'info');
            return;
        }
        
        if (confirm('Are you sure you want to clear all summarization history? (Your pinned favorites will remain intact)')) {
            historyList = [];
            
            if (isLoggedIn) {
                try {
                    const res = await fetch('/api/user/history/clear', { method: 'POST' });
                    if (!res.ok) throw new Error('Database clear failed');
                } catch (err) {
                    console.error(err);
                    showToast('Failed to clear history from cloud.', 'error');
                }
            } else {
                localStorage.setItem('scribetube_history', JSON.stringify(historyList));
            }
            
            renderHistoryTab();
            renderSidebarRecentList();
            showToast('History cleared.', 'success');
        }
    }

    clearHistoryBtn.addEventListener('click', clearAllHistory);

    // --- 8. Star Favorite Summary Management ---
    favoriteBtn.addEventListener('click', async () => {
        if (!currentSummaryData) return;

        const isStarred = favoriteBtn.classList.contains('starred');
        const videoId = currentSummaryData.videoId;

        if (isLoggedIn) {
            try {
                const res = await fetch('/api/user/favorite/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ videoId })
                });
                if (res.ok) {
                    const data = await res.json();
                    
                    if (data.is_favorite) {
                        currentSummaryData.is_favorite = true;
                        favoritesList = favoritesList.filter(item => item.videoId !== videoId);
                        favoritesList.unshift({ ...currentSummaryData });
                        
                        updateFavoriteBtnState(true);
                        showToast('Saved to Favorites!', 'success');
                    } else {
                        currentSummaryData.is_favorite = false;
                        favoritesList = favoritesList.filter(item => item.videoId !== videoId);
                        
                        updateFavoriteBtnState(false);
                        showToast('Removed from Favorites', 'info');
                    }
                    renderFavoritesTab();
                } else {
                    throw new Error('Database favorite toggle failed');
                }
            } catch (err) {
                console.error(err);
                showToast('Failed to save favorite to cloud.', 'error');
            }
        } else {
            if (isStarred) {
                // Unstar: Remove from favorites
                favoritesList = favoritesList.filter(item => item.videoId !== videoId);
                localStorage.setItem('scribetube_favorites', JSON.stringify(favoritesList));
                
                updateFavoriteBtnState(false);
                renderFavoritesTab();
                showToast('Removed from Favorites', 'info');
            } else {
                // Star: Save full item details to favorites
                const favItem = { ...currentSummaryData, timestamp: new Date().toISOString() };
                favoritesList.unshift(favItem);
                localStorage.setItem('scribetube_favorites', JSON.stringify(favoritesList));
                
                updateFavoriteBtnState(true);
                renderFavoritesTab();
                showToast('Saved to Favorites!', 'success');
            }
        }
    });

    function updateFavoriteBtnState(isStarred) {
        const icon = favoriteBtn.querySelector('i');
        const label = favoriteBtn.querySelector('span');

        if (isStarred) {
            favoriteBtn.classList.add('starred');
            icon.className = 'fa-solid fa-star';
            label.textContent = 'Saved';
        } else {
            favoriteBtn.classList.remove('starred');
            icon.className = 'fa-regular fa-star';
            label.textContent = 'Save Summary';
        }
    }

    async function deleteFromFavorites(videoId) {
        favoritesList = favoritesList.filter(item => item.videoId !== videoId);
        
        if (isLoggedIn) {
            try {
                const res = await fetch('/api/user/favorite/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ videoId })
                });
                if (!res.ok) throw new Error('Database favorite delete failed');
            } catch (err) {
                console.error(err);
                showToast('Failed to remove favorite from cloud.', 'error');
            }
        } else {
            localStorage.setItem('scribetube_favorites', JSON.stringify(favoritesList));
        }
        
        renderFavoritesTab();
        showToast('Removed from favorites.', 'info');
        
        // Synchronize state if this item is currently displayed in active results
        if (currentSummaryData && currentSummaryData.videoId === videoId) {
            updateFavoriteBtnState(false);
        }
    }

    function checkIsStarred(videoId) {
        return favoritesList.some(item => item.videoId === videoId);
    }

    // --- 9. Populating summary back on Home dashboard ---
    function viewSummary(summaryItem) {
        currentSummaryData = summaryItem;
        
        // Reset URL input value in search box to matched link
        videoUrlInput.value = summaryItem.videoUrl || `https://www.youtube.com/watch?v=${summaryItem.videoId}`;
        
        renderResults(summaryItem);
        showSection(resultsSection);
        switchTab('homeTab');
    }

    // Render results back in Home UI
    function renderResults(data) {
        const videoId = data.videoId;
        
        if (videoId) {
            videoThumbnail.innerHTML = `
                <img src="https://img.youtube.com/vi/${videoId}/mqdefault.jpg" alt="Video Thumbnail" onerror="this.src='https://img.youtube.com/vi/${videoId}/0.jpg';">
            `;
        } else {
            videoThumbnail.innerHTML = `<i class="fa-solid fa-file-video" style="font-size: 2.5rem; color: var(--text-muted);"></i>`;
        }

        videoTitle.textContent = data.title || `YouTube Video Summary (ID: ${videoId})`;
        videoUrlLink.href = data.videoUrl || `https://www.youtube.com/watch?v=${videoId}`;
        videoUrlText.textContent = data.videoUrl || `https://youtube.com/watch?v=${videoId}`;

        // Update Channel Details Info
        const channelWrapper = document.getElementById('channelWrapper');
        const channelLink = document.getElementById('channelLink');
        const channelNameText = document.getElementById('channelNameText');

        if (channelWrapper && channelLink && channelNameText) {
            if (data.channelName && data.channelUrl) {
                channelNameText.textContent = data.channelName;
                channelLink.href = data.channelUrl;
                channelWrapper.classList.remove('hidden');
            } else {
                channelWrapper.classList.add('hidden');
            }
        }

        // Initialize Star Button State
        const isStarred = checkIsStarred(videoId);
        updateFavoriteBtnState(isStarred);

        // Format paragraphs
        const paragraphs = data.summary.split('\n\n').filter(p => p.trim());
        summaryText.innerHTML = paragraphs.map(p => `<p>${p.trim()}</p>`).join('');

        takeawayText.textContent = data.takeaway;

        keyPointsList.innerHTML = '';
        let plainKeyPoints = '';
        data.key_points.forEach(point => {
            const li = document.createElement('li');
            li.innerHTML = formatMarkdownBold(point);
            keyPointsList.appendChild(li);

            plainKeyPoints += `• ${cleanMarkdownBold(point)}\n`;
        });
        keyPointsText.textContent = plainKeyPoints.trim();

        // Render Concept Visual Breakdown Section
        renderVisualBreakdown(data.visual_elements);
    }

    function renderVisualBreakdown(visualData) {
        const card = document.getElementById('visualBreakdownCard');
        const container = document.getElementById('visualContainer');
        const titleText = document.getElementById('visualTitleText');
        const icon = document.getElementById('visualIcon');

        if (!card || !container) return;

        // If no visualData is available, hide card gracefully
        if (!visualData || !visualData.type || !visualData.data || !Array.isArray(visualData.data)) {
            card.classList.add('hidden');
            return;
        }

        // Set Title
        titleText.textContent = visualData.title || 'Visual Concept Breakdown';
        container.innerHTML = '';
        card.classList.remove('hidden');

        // Set Icon based on type
        if (visualData.type === 'timeline') {
            icon.className = 'fa-solid fa-clock-rotate-left title-icon purple-text';
        } else if (visualData.type === 'process') {
            icon.className = 'fa-solid fa-route title-icon indigo-text';
        } else if (visualData.type === 'comparison') {
            icon.className = 'fa-solid fa-arrows-left-right title-icon pink-text';
        } else {
            icon.className = 'fa-solid fa-chart-simple title-icon pink-text'; // key_metrics
        }

        // Render HTML content based on type
        if (visualData.type === 'timeline') {
            const wrapper = document.createElement('div');
            wrapper.className = 'timeline-container';
            
            visualData.data.forEach(item => {
                const node = document.createElement('div');
                node.className = 'timeline-node';
                node.innerHTML = `
                    <div class="timeline-badge"></div>
                    <div class="timeline-content-card">
                        <div class="timeline-time">${item.col1 || 'Phase'}</div>
                        <div class="timeline-detail">
                            <h4>${item.col2 || ''}</h4>
                            <p>${item.col3 || ''}</p>
                        </div>
                    </div>
                `;
                wrapper.appendChild(node);
            });
            container.appendChild(wrapper);

        } else if (visualData.type === 'process') {
            const wrapper = document.createElement('div');
            wrapper.className = 'process-flowchart';

            visualData.data.forEach((item, index) => {
                const cardStep = document.createElement('div');
                cardStep.className = 'process-step-card';
                cardStep.innerHTML = `
                    <div class="process-number-badge">${item.col1 || (index + 1)}</div>
                    <div class="process-step-info">
                        <h4>${item.col2 || 'Step'}</h4>
                        <p>${item.col3 || ''}</p>
                    </div>
                `;
                wrapper.appendChild(cardStep);
            });
            container.appendChild(wrapper);

        } else if (visualData.type === 'comparison') {
            const tableWrapper = document.createElement('div');
            tableWrapper.className = 'comparison-table-wrapper';

            const headers = visualData.headers || ['Comparison Aspect', 'Option A', 'Option B'];
            const thHtml = headers.map(h => `<th>${h}</th>`).join('');

            let rowsHtml = '';
            visualData.data.forEach(item => {
                rowsHtml += `
                    <tr>
                        <td class="comparison-aspect">${item.col1 || ''}</td>
                        <td>${item.col2 || ''}</td>
                        <td>${item.col3 || ''}</td>
                    </tr>
                `;
            });

            tableWrapper.innerHTML = `
                <table class="comparison-table">
                    <thead>
                        <tr>${thHtml}</tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            `;
            container.appendChild(tableWrapper);

        } else if (visualData.type === 'key_metrics') {
            const grid = document.createElement('div');
            grid.className = 'metrics-scorecard-grid';

            visualData.data.forEach(item => {
                const metricCard = document.createElement('div');
                metricCard.className = 'metric-score-card';
                metricCard.innerHTML = `
                    <div class="metric-value">${item.col1 || '0'}</div>
                    <div class="metric-label">${item.col2 || 'Metric'}</div>
                    <div class="metric-desc">${item.col3 || ''}</div>
                `;
                grid.appendChild(metricCard);
            });
            container.appendChild(grid);
        }
    }

    // --- 10. List Render Components ---

    // History Tab Grids
    function renderHistoryTab() {
        historyGrid.innerHTML = '';
        
        if (historyList.length === 0) {
            historyGrid.innerHTML = `
                <div class="empty-grid-msg">
                    <i class="fa-solid fa-clock-rotate-left"></i>
                    <p>Your history is empty. Summarize a video to add a record here.</p>
                </div>
            `;
            return;
        }

        historyList.forEach(item => {
            const dateLabel = formatTimestamp(item.timestamp);
            const card = document.createElement('div');
            card.className = 'glass-card grid-card';
            card.dataset.videoId = item.videoId;
            
            const isStarred = checkIsStarred(item.videoId);
            
            card.innerHTML = `
                <div class="grid-card-thumbnail">
                    <img src="https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg" alt="Thumbnail" onerror="this.src='https://img.youtube.com/vi/${item.videoId}/0.jpg';">
                    <button class="grid-card-star ${isStarred ? 'active' : ''}" title="${isStarred ? 'Remove Favorite' : 'Save Favorite'}">
                        <i class="${isStarred ? 'fa-solid' : 'fa-regular'} fa-star"></i>
                    </button>
                </div>
                <div class="grid-card-content">
                    <span class="grid-card-date">${dateLabel}</span>
                    <h3 class="grid-card-title">${item.title || 'YouTube Summary'}</h3>
                    <p class="grid-card-takeaway">${item.takeaway}</p>
                    <div class="grid-card-actions">
                        <button class="grid-card-view-btn">
                            <span>View Summary</span>
                            <i class="fa-solid fa-arrow-right"></i>
                        </button>
                        <button class="grid-card-delete-btn" title="Delete from history">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            `;

            // Card Event listeners
            card.querySelector('.grid-card-view-btn').addEventListener('click', () => viewSummary(item));
            card.querySelector('.grid-card-delete-btn').addEventListener('click', () => deleteFromHistory(item.videoId));
            
            // Inline Card Star Toggle click
            const starBtn = card.querySelector('.grid-card-star');
            starBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleStarInline(item, starBtn);
            });

            historyGrid.appendChild(card);
        });
    }

    // Favorites Tab Grids
    function renderFavoritesTab() {
        favoritesGrid.innerHTML = '';
        
        if (favoritesList.length === 0) {
            favoritesGrid.innerHTML = `
                <div class="empty-grid-msg">
                    <i class="fa-solid fa-star"></i>
                    <p>You have no saved favorites yet. Star summaries on the Home tab to save them here.</p>
                </div>
            `;
            return;
        }

        favoritesList.forEach(item => {
            const dateLabel = formatTimestamp(item.timestamp);
            const card = document.createElement('div');
            card.className = 'glass-card grid-card';
            card.dataset.videoId = item.videoId;
            
            card.innerHTML = `
                <div class="grid-card-thumbnail">
                    <img src="https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg" alt="Thumbnail" onerror="this.src='https://img.youtube.com/vi/${item.videoId}/0.jpg';">
                    <button class="grid-card-star active" title="Remove Favorite">
                        <i class="fa-solid fa-star"></i>
                    </button>
                </div>
                <div class="grid-card-content">
                    <span class="grid-card-date">${dateLabel}</span>
                    <h3 class="grid-card-title">${item.title || 'YouTube Summary'}</h3>
                    <p class="grid-card-takeaway">${item.takeaway}</p>
                    <div class="grid-card-actions">
                        <button class="grid-card-view-btn">
                            <span>View Summary</span>
                            <i class="fa-solid fa-arrow-right"></i>
                        </button>
                        <button class="grid-card-delete-btn" title="Remove from favorites">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            `;

            card.querySelector('.grid-card-view-btn').addEventListener('click', () => viewSummary(item));
            card.querySelector('.grid-card-delete-btn').addEventListener('click', () => deleteFromFavorites(item.videoId));
            card.querySelector('.grid-card-star').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteFromFavorites(item.videoId);
            });

            favoritesGrid.appendChild(card);
        });
    }

    // Sidebar Small List menu
    function renderSidebarRecentList() {
        sidebarRecentList.innerHTML = '';
        
        // Take the 5 most recent history entries
        const recents = historyList.slice(0, 5);

        if (recents.length === 0) {
            sidebarRecentList.innerHTML = `<li class="empty-recent-msg">No summaries generated yet.</li>`;
            return;
        }

        recents.forEach(item => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.className = 'recent-item-btn';
            btn.title = item.title || 'YouTube Summary';
            btn.innerHTML = `<i class="fa-solid fa-play" style="font-size: 0.7rem; margin-right: 0.4rem; color: var(--text-muted);"></i>${item.title || 'YouTube Summary'}`;
            
            btn.addEventListener('click', () => viewSummary(item));
            li.appendChild(btn);
            sidebarRecentList.appendChild(li);
        });
    }

    // Inline star toggle helper for the grid card thumbnails
    function toggleStarInline(item, starBtn) {
        const videoId = item.videoId;
        const isStarred = checkIsStarred(videoId);

        if (isStarred) {
            favoritesList = favoritesList.filter(f => f.videoId !== videoId);
            localStorage.setItem('scribetube_favorites', JSON.stringify(favoritesList));
            
            starBtn.classList.remove('active');
            starBtn.querySelector('i').className = 'fa-regular fa-star';
            starBtn.title = 'Save Favorite';
            showToast('Removed from Favorites', 'info');
        } else {
            const favItem = { ...item, timestamp: new Date().toISOString() };
            favoritesList.unshift(favItem);
            localStorage.setItem('scribetube_favorites', JSON.stringify(favoritesList));
            
            starBtn.classList.add('active');
            starBtn.querySelector('i').className = 'fa-solid fa-star';
            starBtn.title = 'Remove Favorite';
            showToast('Saved to Favorites!', 'success');
        }
        
        // Synchronize Active Result view buttons & grids
        if (currentSummaryData && currentSummaryData.videoId === videoId) {
            updateFavoriteBtnState(!isStarred);
        }
        renderFavoritesTab();
        
        // Re-render history grid to synchronize star visual icons
        renderHistoryTab();
    }

    // Timestamp Formatter (e.g., "OCT 25, 2026 • 2:30 PM")
    function formatTimestamp(isoString) {
        if (!isoString) return 'RECENT SUMMARY';
        try {
            const date = new Date(isoString);
            const options = { month: 'short', day: 'numeric', year: 'numeric' };
            const dateStr = date.toLocaleDateString('en-US', options);
            const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            return `${dateStr} • ${timeStr}`;
        } catch (e) {
            return 'RECENT';
        }
    }

    // --- 11. Search Filtering Logic ---
    
    // History search input listener
    historySearch.addEventListener('keyup', () => {
        const query = historySearch.value.toLowerCase().trim();
        const cards = historyGrid.querySelectorAll('.grid-card');
        let matches = 0;

        cards.forEach(card => {
            const videoId = card.dataset.videoId;
            const historyItem = historyList.find(item => item.videoId === videoId);
            
            if (historyItem) {
                const titleMatch = (historyItem.title || '').toLowerCase().includes(query);
                const summaryMatch = (historyItem.summary || '').toLowerCase().includes(query);
                const takeawayMatch = (historyItem.takeaway || '').toLowerCase().includes(query);

                if (titleMatch || summaryMatch || takeawayMatch) {
                    card.classList.remove('hidden');
                    matches++;
                } else {
                    card.classList.add('hidden');
                }
            }
        });

        // Toggle empty query message dynamically
        let emptyMsg = historyGrid.querySelector('.search-empty-msg');
        if (matches === 0 && historyList.length > 0) {
            if (!emptyMsg) {
                emptyMsg = document.createElement('div');
                emptyMsg.className = 'empty-grid-msg search-empty-msg';
                emptyMsg.innerHTML = `<i class="fa-solid fa-magnifying-glass-minus"></i><p>No matches found in history for "${query}"</p>`;
                historyGrid.appendChild(emptyMsg);
            } else {
                emptyMsg.querySelector('p').textContent = `No matches found in history for "${query}"`;
                emptyMsg.classList.remove('hidden');
            }
        } else if (emptyMsg) {
            emptyMsg.classList.add('hidden');
        }
    });

    // Favorites search input listener
    favoritesSearch.addEventListener('keyup', () => {
        const query = favoritesSearch.value.toLowerCase().trim();
        const cards = favoritesGrid.querySelectorAll('.grid-card');
        let matches = 0;

        cards.forEach(card => {
            const videoId = card.dataset.videoId;
            const favoriteItem = favoritesList.find(item => item.videoId === videoId);
            
            if (favoriteItem) {
                const titleMatch = (favoriteItem.title || '').toLowerCase().includes(query);
                const summaryMatch = (favoriteItem.summary || '').toLowerCase().includes(query);
                const takeawayMatch = (favoriteItem.takeaway || '').toLowerCase().includes(query);

                if (titleMatch || summaryMatch || takeawayMatch) {
                    card.classList.remove('hidden');
                    matches++;
                } else {
                    card.classList.add('hidden');
                }
            }
        });

        // Toggle empty query message
        let emptyMsg = favoritesGrid.querySelector('.search-empty-msg');
        if (matches === 0 && favoritesList.length > 0) {
            if (!emptyMsg) {
                emptyMsg = document.createElement('div');
                emptyMsg.className = 'empty-grid-msg search-empty-msg';
                emptyMsg.innerHTML = `<i class="fa-solid fa-magnifying-glass-minus"></i><p>No matches found in favorites for "${query}"</p>`;
                favoritesGrid.appendChild(emptyMsg);
            } else {
                emptyMsg.querySelector('p').textContent = `No matches found in favorites for "${query}"`;
                emptyMsg.classList.remove('hidden');
            }
        } else if (emptyMsg) {
            emptyMsg.classList.add('hidden');
        }
    });

    // --- 12. Copy and Downloads ---
    copyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const targetElement = document.getElementById(targetId);
            
            if (!targetElement) return;

            let textToCopy = '';
            if (targetId === 'summaryText') {
                textToCopy = targetElement.innerText;
            } else {
                textToCopy = targetElement.textContent;
            }

            copyToClipboard(textToCopy, btn);
        });
    });

    copyAllBtn.addEventListener('click', () => {
        if (!currentSummaryData) return;

        const fullText = buildFullSummaryText();
        copyToClipboard(fullText, copyAllBtn);
    });

    function copyToClipboard(text, triggerElement) {
        if (!text) return;
        
        navigator.clipboard.writeText(text).then(() => {
            showToast('Copied to clipboard!', 'success');
            
            const icon = triggerElement.querySelector('i');
            if (icon) {
                const originalClass = icon.className;
                icon.className = 'fa-solid fa-check';
                triggerElement.style.color = 'var(--success)';
                
                setTimeout(() => {
                    icon.className = originalClass;
                    triggerElement.style.color = '';
                }, 1500);
            }
        }).catch(err => {
            console.error('Clipboard copy failed:', err);
            showToast('Failed to copy to clipboard.', 'error');
        });
    }

    function buildFullSummaryText() {
        if (!currentSummaryData) return '';
        
        const title = currentSummaryData.title || `Video Summary (${currentSummaryData.videoId})`;
        const url = currentSummaryData.videoUrl || `https://youtube.com/watch?v=${currentSummaryData.videoId}`;
        
        let fileContent = `==================================================\n`;
        fileContent += `YOUTUBE VIDEO SUMMARY: ${title.toUpperCase()}\n`;
        fileContent += `Source: ${url}\n`;
        fileContent += `Generated via ScribeTube Summarizer\n`;
        fileContent += `==================================================\n\n`;
        
        fileContent += `[EXECUTIVE SUMMARY]\n`;
        fileContent += `${currentSummaryData.summary.trim()}\n\n`;
        
        fileContent += `[KEY INSIGHTS & DETAILS]\n`;
        currentSummaryData.key_points.forEach(point => {
            fileContent += `- ${cleanMarkdownBold(point)}\n`;
        });
        fileContent += `\n`;
        
        fileContent += `[CORE TAKEAWAY]\n`;
        fileContent += `${currentSummaryData.takeaway.trim()}\n\n`;
        fileContent += `==================================================\n`;
        
        return fileContent;
    }

    function cleanMarkdownBold(str) {
        return str.replace(/\*\*/g, '');
    }

    function formatMarkdownBold(str) {
        return str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    }

    downloadBtn.addEventListener('click', () => {
        if (!currentSummaryData) return;
        
        const textContent = buildFullSummaryText();
        const videoId = currentSummaryData.videoId || 'youtube';
        const fileName = `youtube_${videoId}_summary.txt`;
        
        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        
        document.body.appendChild(link);
        link.click();
        
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showToast('Summary downloaded successfully!', 'success');
    });

    newSummaryBtn.addEventListener('click', resetForm);
    tryAgainBtn.addEventListener('click', resetForm);

    function resetForm() {
        summarizeForm.reset();
        showSection(featuresSection);
        currentSummaryData = null;
        switchTab('homeTab');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // --- 13. Toast Notification ---
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconClass = 'fa-solid fa-circle-info';
        if (type === 'success') iconClass = 'fa-solid fa-circle-check';
        if (type === 'error') iconClass = 'fa-solid fa-circle-exclamation';
        
        toast.innerHTML = `
            <i class="${iconClass} toast-icon"></i>
            <span>${message}</span>
        `;
        
        toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('toast-fade-out');
            setTimeout(() => {
                if (toast.parentNode === toastContainer) {
                    toastContainer.removeChild(toast);
                }
            }, 300);
        }, 3700);
    }

    // Initialize elements on boot
    checkAuthStatusAndLoad();
});

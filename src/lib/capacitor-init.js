// Capacitor platform initialization
// Handles Android back button and other native platform concerns

async function initCapacitor() {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;

    const { App } = await import('@capacitor/app');

    // Android hardware back button: navigate back or exit
    App.addListener('backButton', ({ canGoBack }) => {
      // If chat is open, close it first
      if (document.body.classList.contains('chat-open')) {
        document.body.classList.remove('chat-open');
        sessionStorage.setItem('chat-panel-open', 'false');
        return;
      }

      // If sidebar is open, close it first
      if (document.body.classList.contains('sidebar-open')) {
        window.dispatchEvent(new CustomEvent('toggle-sidebar'));
        return;
      }

      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });
  } catch (e) {
    // Not running in Capacitor — ignore
  }
}

initCapacitor();

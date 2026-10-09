import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// اگر رندر یا افکتی از کنترل خارج شود، به‌جای صفحهٔ سفید پیام بازگشت دیده شود
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[app] render error', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="boot">
          <p className="err">خطای غیرمنتظره‌ای رخ داد.</p>
          <button type="button" className="ghost" onClick={() => window.location.reload()}>
            بارگذاری دوباره
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const el = document.getElementById('root');
if (el) {
  createRoot(el).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

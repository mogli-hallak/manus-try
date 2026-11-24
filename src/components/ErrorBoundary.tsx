import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'אירעה שגיאה בלתי צפויה',
    };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      let friendlyMessage = 'משהו השתבש בחיבור או בטעינת הנתונים.';
      if (this.state.message.includes('Missing or insufficient permissions')) {
        friendlyMessage =
          'אין הרשאה לבצע פעולה זו או שהחדר ננעל. ניתן לרענן או לחזור למסך הבית.';
      }
      return (
        <div
          dir="rtl"
          className="min-h-screen flex items-center justify-center p-6 bg-[#F7F8FA] dark:bg-[#0F141B] text-slate-900 dark:text-slate-100"
        >
          <div className="max-w-md w-full rounded-2xl bg-white dark:bg-[#18202A] border border-slate-200 dark:border-slate-800 p-6 shadow-sm text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-700 dark:text-slate-200">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold">לא ניתן להשלים את הפעולה</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {friendlyMessage}
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  window.location.href = window.location.pathname;
                }}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#1E3A5F] text-white text-sm font-medium hover:bg-[#172E4B] transition-colors inline-flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>חזרה למסך הבית</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

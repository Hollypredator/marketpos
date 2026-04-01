import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: unknown): void {
    console.error('Web dashboard runtime error', error);
  }

  public render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <main className="admin-shell login-mode">
          <section className="card login-card">
            <h1>Beklenmeyen Hata</h1>
            <p className="muted">
              Uygulama beklenmeyen bir hata ile karsilasti. Sayfayi yenileyerek tekrar deneyin.
            </p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from 'react';
class ErrorBoundary extends Component {
    state = {
        hasError: false,
        error: null,
        errorInfo: null
    };
    static getDerivedStateFromError(error) {
        return { hasError: true, error, errorInfo: null };
    }
    componentDidCatch(error, errorInfo) {
        console.error('Uncaught error:', error, errorInfo);
        this.setState({ errorInfo });
    }
    render() {
        if (this.state.hasError) {
            return (_jsxs("div", { style: {
                    padding: '2rem',
                    fontFamily: 'sans-serif',
                    backgroundColor: '#ffdddd',
                    color: '#990000',
                    minHeight: '100vh',
                    boxSizing: 'border-box'
                }, children: [_jsx("h1", { children: "Something went wrong." }), _jsx("p", { style: { fontWeight: 'bold' }, children: this.state.error && this.state.error.toString() }), _jsxs("details", { style: { whiteSpace: 'pre-wrap', marginTop: '1rem', background: '#fff', padding: '1rem', border: '1px solid #cc0000', borderRadius: '4px' }, children: [_jsx("summary", { children: "Stack Trace" }), this.state.errorInfo && this.state.errorInfo.componentStack] })] }));
        }
        return this.props.children;
    }
}
export default ErrorBoundary;

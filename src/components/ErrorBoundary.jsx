import { Component } from 'react';
import { Box, Typography, Button, Stack } from '@mui/material';
import { ErrorOutlineRounded, RefreshRounded } from '@mui/icons-material';

/**
 * Catches a render-time crash and shows something honest.
 *
 * Without one, a single thrown error in any feature unmounts the whole React
 * tree and leaves a blank white page — no message, no way back, and nothing in
 * the UI to say what happened. Money software should not do that.
 *
 * This deliberately does not swallow the error: it re-throws nothing, but it
 * logs the component stack so the browser console still carries the detail.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Fintraxa] Unhandled render error', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <Box
        role="alert"
        sx={{
          minHeight: '60dvh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          px: 3, gap: 1.5,
        }}
      >
        <ErrorOutlineRounded sx={{ fontSize: 40, color: 'text.disabled' }} />
        <Typography sx={{ fontSize: '1rem', fontWeight: 700 }}>
          This screen ran into a problem
        </Typography>
        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', maxWidth: 360 }}>
          Your data is safe — nothing was saved or changed. Try again, and if it
          keeps happening, reload the page.
        </Typography>

        {import.meta.env.DEV && (
          <Typography
            component="pre"
            sx={{
              fontSize: '0.65rem', color: 'error.main', textAlign: 'left',
              maxWidth: '100%', overflow: 'auto', mt: 1, p: 1.5, borderRadius: 2,
              bgcolor: 'action.hover', fontFamily: 'monospace',
            }}
          >
            {error.stack || String(error)}
          </Typography>
        )}

        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button
            variant="contained" size="small" startIcon={<RefreshRounded />}
            onClick={this.handleReset} sx={{ borderRadius: 2.5, fontWeight: 600 }}
          >
            Try again
          </Button>
          <Button
            variant="text" size="small" color="inherit"
            onClick={() => window.location.reload()}
            sx={{ borderRadius: 2.5, fontWeight: 600 }}
          >
            Reload
          </Button>
        </Stack>
      </Box>
    );
  }
}

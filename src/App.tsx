import { useState, useCallback } from 'react';
import { ThemeProvider, CssBaseline, Box } from '@mui/material';
import { theme } from './theme';
import { FirstScreen } from './components/FirstScreen';
import { SecondScreen } from './components/SecondScreen';
import type { CryptoOption, OptionType, ParsedMarket, PolymarketEvent } from './types';

type Screen = 'first' | 'second';

interface AppState {
  event: PolymarketEvent | null;
  markets: ParsedMarket[];
  crypto: CryptoOption | null;
  optionType: OptionType;
}

function App() {
  const [screen, setScreen] = useState<Screen>('first');
  const [appState, setAppState] = useState<AppState>({
    event: null,
    markets: [],
    crypto: null,
    optionType: 'above',
  });

  const handleNavigateToChart = useCallback(
    (event: PolymarketEvent, markets: ParsedMarket[], crypto: CryptoOption | null, optionType: OptionType) => {
      setAppState({ event, markets, crypto, optionType });
      setScreen('second');
    },
    []
  );

  const handleBack = useCallback(() => {
    setScreen('first');
    setAppState({ event: null, markets: [], crypto: null, optionType: 'above' });
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: 'background.default',
        }}
      >
        {screen === 'first' && (
          <FirstScreen onNavigateToChart={handleNavigateToChart} />
        )}
        {screen === 'second' && appState.event && (
          <SecondScreen
            event={appState.event}
            markets={appState.markets}
            crypto={appState.crypto}
            optionType={appState.optionType}
            onBack={handleBack}
          />
        )}
      </Box>
    </ThemeProvider>
  );
}

export default App;

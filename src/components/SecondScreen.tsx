import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Checkbox,
  FormControlLabel,
  CircularProgress,
  IconButton,
  Chip,
  Alert,
  TextField,
} from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import type { CryptoOption, OptionType, ParsedMarket, PolymarketEvent, SelectedStrike, ProjectionPoint } from '../types';
import { fetchCurrentPrice } from '../api/binance';
import { solveImpliedVol, computeProjectionCurve, computeExpiryPayoff } from '../pricing/engine';
import { ProjectionChart } from './ProjectionChart';

interface SecondScreenProps {
  event: PolymarketEvent;
  markets: ParsedMarket[];
  crypto: CryptoOption | null;
  optionType: OptionType;
  onBack: () => void;
}

const CRYPTO_COLORS: Record<CryptoOption, string> = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  SOL: '#9945FF',
  XRP: '#23292F',
};

function formatTimeToExpiry(seconds: number): string {
  if (seconds <= 0) return 'Expired';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function SecondScreen({
  event,
  markets,
  crypto,
  optionType,
  onBack,
}: SecondScreenProps) {
  const [selectedMarketIds, setSelectedMarketIds] = useState<Set<string>>(new Set());
  const [spotPrice, setSpotPrice] = useState<number | null>(null);
  const [loadingSpot, setLoadingSpot] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lowerPrice, setLowerPrice] = useState<string>('');
  const [upperPrice, setUpperPrice] = useState<string>('');

  // Expiration from event
  const expirationTs = event.endDate;
  const nowTs = Math.floor(Date.now() / 1000);
  const timeToExpirySec = expirationTs - nowTs;
  const tauNow = Math.max(timeToExpirySec / (365.25 * 24 * 3600), 0);

  // Fetch current crypto price
  useEffect(() => {
    if (!crypto) return;
    setLoadingSpot(true);
    fetchCurrentPrice(crypto)
      .then((price) => {
        setSpotPrice(price);
        setLowerPrice((price * 0.7).toFixed(0));
        setUpperPrice((price * 1.3).toFixed(0));
      })
      .catch((err) => {
        console.error('Failed to fetch spot price:', err);
        setError(`Failed to fetch ${crypto} price`);
      })
      .finally(() => setLoadingSpot(false));
  }, [crypto]);

  const handleToggleMarket = useCallback((marketId: string) => {
    setSelectedMarketIds((prev) => {
      const next = new Set(prev);
      if (next.has(marketId)) {
        next.delete(marketId);
      } else {
        next.add(marketId);
      }
      return next;
    });
  }, []);

  // Calibrate IV for selected strikes
  const selectedStrikes: SelectedStrike[] = useMemo(() => {
    if (!spotPrice || tauNow <= 0) return [];

    return markets
      .filter((m) => selectedMarketIds.has(m.id))
      .map((m) => {
        const iv = solveImpliedVol(spotPrice, m.strikePrice, tauNow, m.currentPrice, optionType);
        return {
          marketId: m.id,
          question: m.question,
          groupItemTitle: m.groupItemTitle,
          strikePrice: m.strikePrice,
          currentPrice: m.currentPrice,
          impliedVol: iv ?? 0.5,
        };
      });
  }, [markets, selectedMarketIds, spotPrice, tauNow, optionType]);

  // Parse price range
  const lower = parseFloat(lowerPrice) || 0;
  const upper = parseFloat(upperPrice) || 0;
  const validRange = lower > 0 && upper > lower;

  // Compute 4 projection curves
  const projectionCurves: ProjectionPoint[][] = useMemo(() => {
    if (selectedStrikes.length === 0 || !validRange) return [];

    const tau1 = tauNow;
    const tau2 = tauNow * (2 / 3);
    const tau3 = tauNow * (1 / 3);

    const curve1 = computeProjectionCurve(selectedStrikes, lower, upper, tau1, optionType);
    const curve2 = computeProjectionCurve(selectedStrikes, lower, upper, tau2, optionType);
    const curve3 = computeProjectionCurve(selectedStrikes, lower, upper, tau3, optionType);
    const curve4 = computeExpiryPayoff(selectedStrikes, lower, upper);

    return [curve1, curve2, curve3, curve4];
  }, [selectedStrikes, lower, upper, tauNow, optionType, validRange]);

  const expiryDate = new Date(expirationTs * 1000);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        p: 3,
        gap: 3,
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton
          onClick={onBack}
          sx={{
            bgcolor: 'rgba(139, 157, 195, 0.1)',
            '&:hover': { bgcolor: 'rgba(139, 157, 195, 0.2)' },
          }}
        >
          <ArrowBack />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              background: 'linear-gradient(90deg, #E8EDF5 0%, #00D1FF 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {event.title}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
            {crypto && (
              <Chip
                label={crypto}
                size="small"
                sx={{
                  bgcolor: `${CRYPTO_COLORS[crypto]}20`,
                  color: CRYPTO_COLORS[crypto],
                  border: `1px solid ${CRYPTO_COLORS[crypto]}40`,
                }}
              />
            )}
            <Chip
              label={optionType === 'above' ? 'European Binary' : 'One-Touch Barrier'}
              size="small"
              sx={{
                bgcolor: 'rgba(0, 209, 255, 0.1)',
                color: '#00D1FF',
                border: '1px solid rgba(0, 209, 255, 0.3)',
              }}
            />
            <Chip
              label={`Expires: ${expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
              size="small"
              sx={{
                bgcolor: 'rgba(139, 157, 195, 0.1)',
                color: '#8B9DC3',
                border: '1px solid rgba(139, 157, 195, 0.2)',
              }}
            />
            <Chip
              label={`Time to expiry: ${formatTimeToExpiry(timeToExpirySec)}`}
              size="small"
              sx={{
                bgcolor: 'rgba(139, 157, 195, 0.1)',
                color: '#8B9DC3',
                border: '1px solid rgba(139, 157, 195, 0.2)',
              }}
            />
            {spotPrice && (
              <Chip
                label={`${crypto} Spot: $${spotPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                size="small"
                sx={{
                  bgcolor: 'rgba(34, 197, 94, 0.1)',
                  color: '#22C55E',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
              />
            )}
          </Box>
        </Box>
      </Box>

      {error && (
        <Alert
          severity="error"
          onClose={() => setError(null)}
          sx={{
            bgcolor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
          }}
        >
          {error}
        </Alert>
      )}

      {/* Chart */}
      <Paper
        elevation={0}
        sx={{
          flex: 1,
          minHeight: 500,
          p: 3,
          border: '1px solid rgba(139, 157, 195, 0.15)',
        }}
      >
        {loadingSpot ? (
          <Box
            sx={{
              height: '100%',
              minHeight: 440,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CircularProgress />
          </Box>
        ) : selectedMarketIds.size === 0 ? (
          <Box
            sx={{
              height: '100%',
              minHeight: 440,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 2,
              color: 'text.secondary',
            }}
          >
            <Typography variant="h6">No strikes selected</Typography>
            <Typography variant="body2">
              Select strikes below to see the projection chart
            </Typography>
          </Box>
        ) : !validRange ? (
          <Box
            sx={{
              height: '100%',
              minHeight: 440,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 2,
              color: 'text.secondary',
            }}
          >
            <Typography variant="h6">Set a valid price range</Typography>
            <Typography variant="body2">
              Enter lower and upper {crypto} prices below
            </Typography>
          </Box>
        ) : projectionCurves.length > 0 && spotPrice ? (
          <ProjectionChart
            curves={projectionCurves}
            currentCryptoPrice={spotPrice}
            numStrikes={selectedMarketIds.size}
            cryptoSymbol={crypto || 'BTC'}
          />
        ) : null}

        {/* Price Range Inputs */}
        {!loadingSpot && (
          <Box
            sx={{
              display: 'flex',
              gap: 3,
              mt: 2,
              pt: 2,
              borderTop: '1px solid rgba(139, 157, 195, 0.1)',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <TextField
              label={`Lower ${crypto} Price`}
              value={lowerPrice}
              onChange={(e) => setLowerPrice(e.target.value)}
              type="number"
              size="small"
              sx={{ width: 200 }}
            />
            <TextField
              label={`Upper ${crypto} Price`}
              value={upperPrice}
              onChange={(e) => setUpperPrice(e.target.value)}
              type="number"
              size="small"
              sx={{ width: 200 }}
            />
          </Box>
        )}
      </Paper>

      {/* Strike Selection */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          border: '1px solid rgba(139, 157, 195, 0.15)',
        }}
      >
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          Select Strikes
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 2,
          }}
        >
          {markets.map((market) => {
            const isSelected = selectedMarketIds.has(market.id);
            const ivInfo = selectedStrikes.find((s) => s.marketId === market.id);

            return (
              <Paper
                key={market.id}
                elevation={0}
                sx={{
                  p: 2,
                  bgcolor: isSelected ? 'rgba(0, 209, 255, 0.05)' : 'rgba(10, 14, 23, 0.5)',
                  border: isSelected
                    ? '1px solid rgba(0, 209, 255, 0.3)'
                    : '1px solid rgba(139, 157, 195, 0.1)',
                  borderRadius: 2,
                  transition: 'all 0.2s',
                }}
              >
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={isSelected}
                      onChange={() => handleToggleMarket(market.id)}
                      sx={{
                        '&.Mui-checked': { color: '#00D1FF' },
                      }}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        {market.groupItemTitle || market.question}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">
                          Price: {(market.currentPrice * 100).toFixed(1)}%
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Strike: ${market.strikePrice.toLocaleString()}
                        </Typography>
                        {ivInfo && (
                          <Typography variant="body2" sx={{ color: '#00D1FF' }}>
                            IV: {(ivInfo.impliedVol * 100).toFixed(1)}%
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  }
                />
              </Paper>
            );
          })}
        </Box>
      </Paper>
    </Box>
  );
}

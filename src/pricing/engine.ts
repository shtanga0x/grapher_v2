import type { OptionType, SelectedStrike, ProjectionPoint } from '../types';

/**
 * Normal CDF using rational approximation (Abramowitz & Stegun 26.2.17)
 */
export function normalCDF(x: number): number {
  if (x > 8) return 1;
  if (x < -8) return 0;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;
  const y = 1.0 - (a1 * t + a2 * t2 + a3 * t3 + a4 * t4 + a5 * t5) * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}

/**
 * European binary ("above") YES price: P(S, K, σ, τ) = Φ(d₂)
 */
export function priceAbove(S: number, K: number, sigma: number, tau: number): number {
  if (tau <= 0) return S >= K ? 1 : 0;
  if (sigma <= 0) return S >= K ? 1 : 0;

  const sqrtTau = Math.sqrt(tau);
  const d2 = (Math.log(S / K) - (sigma * sigma * tau) / 2) / (sigma * sqrtTau);
  return normalCDF(d2);
}

/**
 * One-touch barrier ("hit") YES price.
 * Probability that GBM starting at S touches barrier H before time τ (r=0).
 * When S ≥ H the barrier is already breached → price = 1.
 * Otherwise uses the reflection-principle formula for an UP barrier:
 *   P = Φ(d₁) + (S/H)·Φ(d₂)
 *   d₁ = (ln(S/H) − σ²τ/2) / (σ√τ)
 *   d₂ = (ln(S/H) + σ²τ/2) / (σ√τ)
 */
export function priceHit(S: number, H: number, sigma: number, tau: number): number {
  if (S >= H) return 1;
  if (tau <= 0) return 0;
  if (sigma <= 0) return 0;

  const sqrtTau = Math.sqrt(tau);
  const logSH = Math.log(S / H); // negative since S < H
  const halfSigmaSqTau = (sigma * sigma * tau) / 2;

  const d1 = (logSH - halfSigmaSqTau) / (sigma * sqrtTau);
  const d2 = (logSH + halfSigmaSqTau) / (sigma * sqrtTau);

  const price = normalCDF(d1) + (S / H) * normalCDF(d2);
  return Math.min(1, Math.max(0, price));
}

/**
 * Price the YES side of an option
 */
export function priceOptionYes(
  S: number, K: number, sigma: number, tau: number, optionType: OptionType
): number {
  return optionType === 'above' ? priceAbove(S, K, sigma, tau) : priceHit(S, K, sigma, tau);
}

/**
 * Implied volatility solver using Brent's method.
 * Always calibrates from the YES price (IV is the same for YES and NO).
 */
export function solveImpliedVol(
  S: number,
  K: number,
  tau: number,
  yesPrice: number,
  optionType: OptionType,
  tolerance: number = 1e-6,
  maxIter: number = 100
): number | null {
  if (yesPrice <= 0.001) return 0.01;
  if (yesPrice >= 0.999) return 10.0;
  if (tau <= 0) return null;

  let a = 0.01;
  let b = 10.0;

  const f = (sigma: number) => priceOptionYes(S, K, sigma, tau, optionType) - yesPrice;

  let fa = f(a);
  let fb = f(b);

  if (fa * fb > 0) {
    let bestSigma = a;
    let bestError = Math.abs(fa);
    for (let sigma = 0.05; sigma <= 10.0; sigma += 0.05) {
      const err = Math.abs(f(sigma));
      if (err < bestError) {
        bestError = err;
        bestSigma = sigma;
      }
    }
    return bestSigma;
  }

  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;

  for (let i = 0; i < maxIter; i++) {
    if (fb * fc > 0) {
      c = a; fc = fa; d = b - a; e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b; b = c; c = a; fa = fb; fb = fc; fc = fa;
    }

    const tol = 2 * Number.EPSILON * Math.abs(b) + tolerance;
    const m = 0.5 * (c - b);

    if (Math.abs(m) <= tol || Math.abs(fb) < tolerance) return b;

    if (Math.abs(e) >= tol && Math.abs(fa) > Math.abs(fb)) {
      const s_val = fb / fa;
      let p_val: number;
      let q_val: number;

      if (a === c) {
        p_val = 2 * m * s_val;
        q_val = 1 - s_val;
      } else {
        const q = fa / fc;
        const r = fb / fc;
        p_val = s_val * (2 * m * q * (q - r) - (b - a) * (r - 1));
        q_val = (q - 1) * (r - 1) * (s_val - 1);
      }

      if (p_val > 0) q_val = -q_val; else p_val = -p_val;

      if (2 * p_val < Math.min(3 * m * q_val - Math.abs(tol * q_val), Math.abs(e * q_val))) {
        e = d; d = p_val / q_val;
      } else {
        d = m; e = m;
      }
    } else {
      d = m; e = m;
    }

    a = b; fa = fb;
    b += Math.abs(d) > tol ? d : (m > 0 ? tol : -tol);
    fb = f(b);
  }

  return b;
}

/**
 * Compute P&L projection curve.
 * P&L = projected value - entry cost
 * For YES: projected value = modelYesPrice; entry cost = entryPrice
 * For NO: projected value = 1 - modelYesPrice; entry cost = entryPrice
 */
export function computePnlCurve(
  strikes: SelectedStrike[],
  lowerPrice: number,
  upperPrice: number,
  tau: number,
  optionType: OptionType,
  numPoints: number = 200
): ProjectionPoint[] {
  if (strikes.length === 0 || numPoints < 2) return [];

  const totalEntry = strikes.reduce((sum, s) => sum + s.entryPrice, 0);
  const step = (upperPrice - lowerPrice) / (numPoints - 1);
  const points: ProjectionPoint[] = [];

  for (let i = 0; i < numPoints; i++) {
    const cryptoPrice = lowerPrice + step * i;
    let projectedValue = 0;

    for (const strike of strikes) {
      const yesPrice = priceOptionYes(cryptoPrice, strike.strikePrice, strike.impliedVol, tau, optionType);
      projectedValue += strike.side === 'YES' ? yesPrice : (1 - yesPrice);
    }

    points.push({ cryptoPrice, pnl: projectedValue - totalEntry });
  }

  return points;
}

/**
 * Compute P&L at expiry (tau → 0).
 */
export function computeExpiryPnl(
  strikes: SelectedStrike[],
  lowerPrice: number,
  upperPrice: number,
  numPoints: number = 200
): ProjectionPoint[] {
  if (strikes.length === 0 || numPoints < 2) return [];

  const totalEntry = strikes.reduce((sum, s) => sum + s.entryPrice, 0);
  const step = (upperPrice - lowerPrice) / (numPoints - 1);
  const points: ProjectionPoint[] = [];

  for (let i = 0; i < numPoints; i++) {
    const cryptoPrice = lowerPrice + step * i;
    let projectedValue = 0;

    for (const strike of strikes) {
      const yesPayoff = cryptoPrice >= strike.strikePrice ? 1 : 0;
      projectedValue += strike.side === 'YES' ? yesPayoff : (1 - yesPayoff);
    }

    points.push({ cryptoPrice, pnl: projectedValue - totalEntry });
  }

  return points;
}

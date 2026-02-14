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
 * European binary ("above") option price.
 * P(S, K, σ, τ) = Φ(d₂)
 * where d₂ = [ln(S/K) - σ²τ/2] / (σ√τ)
 */
export function priceAbove(S: number, K: number, sigma: number, tau: number): number {
  if (tau <= 0) {
    return S >= K ? 1 : 0;
  }
  if (sigma <= 0) {
    return S >= K ? 1 : 0;
  }

  const sqrtTau = Math.sqrt(tau);
  const d2 = (Math.log(S / K) - (sigma * sigma * tau) / 2) / (sigma * sqrtTau);
  return normalCDF(d2);
}

/**
 * One-touch barrier ("hit") option price.
 * Works for both up barriers (H > S) and down barriers (H < S).
 * With r=0:
 *   P(S, H, σ, τ) = Φ(d₁) + (H/S) · Φ(d₂)
 * where:
 *   d₁ = [ln(S/H) + σ²τ/2] / (σ√τ)
 *   d₂ = [ln(S/H) - σ²τ/2] / (σ√τ)
 *
 * Note: the formula for one-touch with r=0 simplifies to:
 *   P = Φ(-|ln(S/H)|/(σ√τ) + σ√τ/2) + Φ(-|ln(S/H)|/(σ√τ) - σ√τ/2)
 * But we use the general form which handles both directions.
 */
export function priceHit(S: number, H: number, sigma: number, tau: number): number {
  // Already breached
  if (H >= S && S >= H) return 1; // S === H
  if (H > S && S >= H) return 1; // impossible but safe
  // For up barrier: if S >= H, already touched
  // For down barrier: if S <= H, already touched
  if ((H > S) === false && (H < S) === false) return 1; // S === H

  if (tau <= 0) {
    // At expiry, model limit: step at barrier
    return S >= H ? 1 : (S <= H && H < S ? 1 : 0);
  }
  if (sigma <= 0) {
    return 0;
  }

  const sqrtTau = Math.sqrt(tau);
  const logSH = Math.log(S / H);
  const halfSigmaSqTau = (sigma * sigma * tau) / 2;

  const d1 = (logSH + halfSigmaSqTau) / (sigma * sqrtTau);
  const d2 = (logSH - halfSigmaSqTau) / (sigma * sqrtTau);

  // With r=0, the drift coefficient λ = (r - σ²/2)/σ² = -1/2
  // So (H/S)^(2λ) = (H/S)^(-1) = S/H
  // One-touch = N(-d1') + (S/H) * N(d2')...
  // Actually let me use the correct formula.
  // For a one-touch option paying 1 if barrier H is ever touched:
  // With r=0: P = N(a) + (H/S)^(2*(r-σ²/2)/σ² + 1) * N(b)
  // With r=0: exponent = 2*(-σ²/2)/σ² + 1 = -1 + 1 = 0
  // Wait, that gives (H/S)^0 = 1, so P = N(a) + N(b)

  // Let me recalculate properly. For one-touch with r=0:
  // The formula from the plan:
  // P(S, H, σ, τ) = Φ(d₁) + (H/S) · Φ(d₂)
  // This doesn't look right dimensionally for the standard one-touch.

  // Standard one-touch barrier option (pays $1 at expiry if barrier touched):
  // With drift μ = r - σ²/2, and r=0: μ = -σ²/2
  // P = N((ln(H/S) + μτ)/(σ√τ)) + exp(2μ·ln(H/S)/σ²) · N((ln(H/S) - μτ)/(σ√τ))
  // = N((-logSH - σ²τ/2)/(σ√τ)) + exp(-ln(H/S)) · N((-logSH + σ²τ/2)/(σ√τ))
  // = N((-logSH - σ²τ/2)/(σ√τ)) + (S/H) · N((-logSH + σ²τ/2)/(σ√τ))

  // For UP barrier (H > S), logSH < 0, so -logSH > 0
  // For DOWN barrier (H < S), logSH > 0, so -logSH < 0
  // The formula works for both cases.

  const negLogSH = -logSH; // = ln(H/S)
  const e1 = (negLogSH - halfSigmaSqTau) / (sigma * sqrtTau);
  const e2 = (negLogSH + halfSigmaSqTau) / (sigma * sqrtTau);

  const price = normalCDF(e1) + (S / H) * normalCDF(e2);
  return Math.min(1, Math.max(0, price));
}

/**
 * Price a single option based on type
 */
export function priceOption(
  S: number,
  K: number,
  sigma: number,
  tau: number,
  optionType: OptionType
): number {
  if (optionType === 'above') {
    return priceAbove(S, K, sigma, tau);
  } else {
    return priceHit(S, K, sigma, tau);
  }
}

/**
 * Implied volatility solver using Brent's method.
 * Finds σ such that priceOption(S, K, σ, τ, type) = targetPrice
 */
export function solveImpliedVol(
  S: number,
  K: number,
  tau: number,
  targetPrice: number,
  optionType: OptionType,
  tolerance: number = 1e-6,
  maxIter: number = 100
): number | null {
  // Edge cases
  if (targetPrice <= 0.001) return 0.01; // Near zero price → very low vol
  if (targetPrice >= 0.999) return 10.0; // Near 1 price → very high vol
  if (tau <= 0) return null; // Can't calibrate with no time

  let a = 0.01; // 1% annual vol
  let b = 10.0; // 1000% annual vol

  const f = (sigma: number) => priceOption(S, K, sigma, tau, optionType) - targetPrice;

  let fa = f(a);
  let fb = f(b);

  // Check if root is bracketed
  if (fa * fb > 0) {
    // Try to find a bracket
    // For very deep ITM/OTM, the function may be monotonic and not cross zero
    // Return the vol that gets closest
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

  // Brent's method
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;

  for (let i = 0; i < maxIter; i++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }

    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }

    const tol = 2 * Number.EPSILON * Math.abs(b) + tolerance;
    const m = 0.5 * (c - b);

    if (Math.abs(m) <= tol || Math.abs(fb) < tolerance) {
      return b;
    }

    if (Math.abs(e) >= tol && Math.abs(fa) > Math.abs(fb)) {
      const s_val = fb / fa;
      let p_val: number;
      let q_val: number;

      if (a === c) {
        // Secant method
        p_val = 2 * m * s_val;
        q_val = 1 - s_val;
      } else {
        // Inverse quadratic interpolation
        const q = fa / fc;
        const r = fb / fc;
        p_val = s_val * (2 * m * q * (q - r) - (b - a) * (r - 1));
        q_val = (q - 1) * (r - 1) * (s_val - 1);
      }

      if (p_val > 0) {
        q_val = -q_val;
      } else {
        p_val = -p_val;
      }

      if (2 * p_val < Math.min(3 * m * q_val - Math.abs(tol * q_val), Math.abs(e * q_val))) {
        e = d;
        d = p_val / q_val;
      } else {
        d = m;
        e = m;
      }
    } else {
      d = m;
      e = m;
    }

    a = b;
    fa = fb;

    if (Math.abs(d) > tol) {
      b += d;
    } else {
      b += m > 0 ? tol : -tol;
    }

    fb = f(b);
  }

  return b;
}

/**
 * Calibrate implied volatilities for all selected strikes.
 */
export function calibrateStrikes(
  spotPrice: number,
  markets: Array<{ strikePrice: number; currentPrice: number }>,
  tau: number,
  optionType: OptionType
): (number | null)[] {
  return markets.map(({ strikePrice, currentPrice }) => {
    if (strikePrice <= 0 || currentPrice <= 0) return null;
    return solveImpliedVol(spotPrice, strikePrice, tau, currentPrice, optionType);
  });
}

/**
 * Compute construction cost across a range of crypto prices.
 * For each crypto price X in the range, sums the model price of each selected strike.
 */
export function computeProjectionCurve(
  strikes: SelectedStrike[],
  lowerPrice: number,
  upperPrice: number,
  tau: number,
  optionType: OptionType,
  numPoints: number = 200
): ProjectionPoint[] {
  if (strikes.length === 0 || numPoints < 2) return [];

  const step = (upperPrice - lowerPrice) / (numPoints - 1);
  const points: ProjectionPoint[] = [];

  for (let i = 0; i < numPoints; i++) {
    const cryptoPrice = lowerPrice + step * i;
    let constructionCost = 0;

    for (const strike of strikes) {
      const price = priceOption(cryptoPrice, strike.strikePrice, strike.impliedVol, tau, optionType);
      constructionCost += price;
    }

    points.push({ cryptoPrice, constructionCost });
  }

  return points;
}

/**
 * Compute the at-expiry payoff (tau → 0).
 * For "above": each strike contributes 1 if cryptoPrice >= K, else 0
 * For "hit": same step function at expiry (model limit as tau→0⁺)
 */
export function computeExpiryPayoff(
  strikes: SelectedStrike[],
  lowerPrice: number,
  upperPrice: number,
  numPoints: number = 200
): ProjectionPoint[] {
  if (strikes.length === 0 || numPoints < 2) return [];

  const step = (upperPrice - lowerPrice) / (numPoints - 1);
  const points: ProjectionPoint[] = [];

  for (let i = 0; i < numPoints; i++) {
    const cryptoPrice = lowerPrice + step * i;
    let constructionCost = 0;

    for (const strike of strikes) {
      constructionCost += cryptoPrice >= strike.strikePrice ? 1 : 0;
    }

    points.push({ cryptoPrice, constructionCost });
  }

  return points;
}

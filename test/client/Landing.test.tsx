import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Landing } from '../../src/client/screens/Landing';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Landing use my location', () => {
  it('sends a coarse point, never the raw device fix', () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok({ coords: { latitude: 37.761234567, longitude: -122.414812345 } } as GeolocationPosition),
    );
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
    const onStart = vi.fn();
    render(<Landing busy={false} onStart={onStart} />);
    fireEvent.click(screen.getByRole('button', { name: /use my location/i }));
    expect(onStart).toHaveBeenCalledWith({ lat: 37.76, lng: -122.41 });
  });
});

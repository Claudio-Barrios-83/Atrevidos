/** @vitest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import Login from './+page.svelte';

describe('Login Page', () => {
  it('renders login form by default', () => {
    render(Login);
    expect(screen.getAllByText('Iniciar sesión').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeDefined();
    expect(screen.queryByPlaceholderText('Nombre de usuario')).toBeNull();
  });

  it('switches to register mode when clicked', async () => {
    render(Login);
    const toggleButton = screen.getByText('¿No tienes cuenta? Regístrate');
    await fireEvent.click(toggleButton);
    expect(screen.getByText('Registro')).toBeDefined();
    expect(screen.getByPlaceholderText('Nombre de usuario')).toBeDefined();
  });
});

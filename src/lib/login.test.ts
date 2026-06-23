import { vi, describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Page from '../routes/(auth)/login/+page.svelte';

vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	invalidateAll: vi.fn()
}));

vi.mock('$app/paths', () => ({
	base: ''
}));

vi.mock('$lib/supabase/client', () => ({
	supabase: {
		auth: {
			signInWithPassword: vi.fn(),
			signUp: vi.fn()
		}
	}
}));

describe('Login Page', () => {
  it('should toggle between login and register modes', async () => {
    render(Page);
    
    // Initial state
    const title = screen.getByRole('heading', { level: 1 });
    expect(title.textContent).toBe('Iniciar sesión');
    
    // Toggle
    const toggleButton = screen.getByRole('button', { name: /¿No tienes cuenta\? Regístrate/i });
    await fireEvent.click(toggleButton);
    
    // Using explicit wait for re-render if necessary, though Vitest/JSDOM should be fine
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Registro');
    expect(screen.getByPlaceholderText('Nombre de usuario')).toBeInTheDocument();
    
    // Toggle back
    const toggleButtonBack = screen.getByRole('button', { name: /¿Ya tienes cuenta\? Inicia sesión/i });
    await fireEvent.click(toggleButtonBack);
    
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Iniciar sesión');
    expect(screen.queryByPlaceholderText('Nombre de usuario')).not.toBeInTheDocument();
  });
});

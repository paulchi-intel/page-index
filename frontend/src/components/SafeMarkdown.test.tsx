import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafeMarkdown } from './SafeMarkdown';

describe('SafeMarkdown', () => {
  it('renders formatting without executable HTML', () => {
    const { container } = render(<SafeMarkdown>{'**安全內容** <script>alert(1)</script>'}</SafeMarkdown>);
    expect(screen.getByText('安全內容')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });
});

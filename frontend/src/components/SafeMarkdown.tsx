import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

export function SafeMarkdown({ children }: { children: string }) {
  return <div className="markdown"><ReactMarkdown rehypePlugins={[rehypeSanitize]}>{children}</ReactMarkdown></div>;
}

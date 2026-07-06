export function ErrorView({ message }: { message: string }) {
  return <p role="alert" className="error-view">⚠️ {message}</p>;
}

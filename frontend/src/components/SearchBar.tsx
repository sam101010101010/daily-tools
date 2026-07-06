export function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input type="search" role="searchbox" placeholder="搜索工具…"
      value={value} onChange={e => onChange(e.target.value)} />
  );
}

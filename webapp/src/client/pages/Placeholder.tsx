interface PlaceholderProps {
  title: string;
  description: string;
}

/** Generic placeholder screen used until real features are implemented. */
export function Placeholder({ title, description }: PlaceholderProps) {
  return (
    <div className="flex flex-col gap-2 p-4">
      <h1 className="text-xl font-bold text-teal-800">{title}</h1>
      <p className="text-sm text-gray-500">{description}</p>
      <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-400">
        近日実装予定
      </div>
    </div>
  );
}

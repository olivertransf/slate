/** Icons captured from the user-provided TickTick browser reference. */
export function ReferenceIcon({ name, className = "" }: { name: string; className?: string }) {
  return <svg className={`reference-icon ${className}`} aria-hidden="true"><use href={`/ticktick-icons.svg#${name}`} /></svg>;
}

export function CompletedArtwork() {
  return <div className="completed-artwork" aria-hidden="true">
    {[['empty-common-bg', '#272727'], ['empty-task-list-completed-2', '#dddee1'], ['empty-task-list-completed-3', '#8c5efa'], ['empty-task-list-completed-6', '#474747'], ['empty-task-list-completed-7', '#606060']].map(([name, color]) => <svg key={name} style={{color}}><use href={`/ticktick-icons.svg#${name}`} /></svg>)}
  </div>;
}

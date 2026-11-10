export const UserMessage = ({ text }: { text: string }) => (
  <div className="flex justify-end">
    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-black/[0.05] px-4 py-2.5 text-[13.5px] leading-relaxed text-ink sm:max-w-[70%]">
      <p className="whitespace-pre-wrap break-words">{text}</p>
    </div>
  </div>
);

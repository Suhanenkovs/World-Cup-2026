export default function PitchBackground() {
  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "url('/grass.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          opacity: 0.5,
        }}
      />
      <div className="absolute inset-0 bg-gray-950" style={{ opacity: 0.58 }} />
    </div>
  );
}

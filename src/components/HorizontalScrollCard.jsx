import React, { useRef } from "react";
import Card from "./Card";
import { FaAngleRight, FaAngleLeft } from "react-icons/fa6";

const HorizontalScrollCard = ({ data = [], heading, trending, media_type }) => {
  const contaierRef = useRef();

  const handleNext = () => {
    if (!contaierRef.current) return;
    const step = Math.min(320, Math.floor(contaierRef.current.clientWidth * 0.75));
    contaierRef.current.scrollLeft += step;
  };
  const handlePrevious = () => {
    if (!contaierRef.current) return;
    const step = Math.min(320, Math.floor(contaierRef.current.clientWidth * 0.75));
    contaierRef.current.scrollLeft -= step;
  };

  return (
    <div className="container mx-auto px-3 sm:px-4 my-8 sm:my-10">
      <h2 className="text-lg sm:text-xl lg:text-2xl font-bold mb-3 text-white capitalize px-1">
        {heading}
      </h2>

      <div className="relative">
        <div
          ref={contaierRef}
          className="flex gap-3 sm:gap-4 overflow-x-auto overflow-y-hidden relative z-10 scroll-smooth snap-x snap-mandatory scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0 pb-1"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {data.map((item, index) => (
            <div
              key={(item.id || item.tmdb_id) + "heading" + index}
              className="shrink-0 snap-start w-[132px] sm:w-[152px] md:w-[168px] lg:w-[180px]"
            >
              <Card
                data={item}
                index={index + 1}
                trending={trending}
                media_type={media_type}
              />
            </div>
          ))}
        </div>

        <div className="absolute top-0 hidden lg:flex justify-between w-full h-full items-center pointer-events-none">
          <button
            type="button"
            onClick={handlePrevious}
            className="pointer-events-auto bg-white/95 p-2 text-black rounded-full -ml-1 z-10 shadow tap-target"
            aria-label="Scroll left"
          >
            <FaAngleLeft />
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="pointer-events-auto bg-white/95 p-2 text-black rounded-full -mr-1 z-10 shadow tap-target"
            aria-label="Scroll right"
          >
            <FaAngleRight />
          </button>
        </div>
      </div>
    </div>
  );
};

export default HorizontalScrollCard;

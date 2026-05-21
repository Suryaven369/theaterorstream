import React from "react";
import { IoClose } from "react-icons/io5";

const VideoPlay = ({ data, close, media_type }) => {
  const videos = data?.videos?.results || data?.videos || [];
  const videoKey = videos.find((video) => video?.key)?.key || videos[0]?.key;

  return (
    <section className="fixed bg-neutral-700 top-0 right-0 bottom-0 left-0 z-40 bg-opacity-50 flex justify-center items-center">
      <div className="bg-black w-full max-h-[80vh] max-w-screen-lg aspect-video rounded relative">
        <button
          onClick={close}
          className=" absolute -right-1 -top-6 text-3xl z-50"
        >
          <IoClose />
        </button>

        {videoKey ? (
          <iframe
            src={`https://www.youtube.com/embed/${videoKey}`}
            className="w-full h-full"
            title="Trailer"
            allowFullScreen
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/60">
            Trailer not available
          </div>
        )}
      </div>
    </section>
  );
};

export default VideoPlay;

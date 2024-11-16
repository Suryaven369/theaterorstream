import { MdHomeFilled } from "react-icons/md";
import { PiTelevisionFill } from "react-icons/pi";
import { BiSolidMoviePlay } from "react-icons/bi";
import { IoSearchOutline } from "react-icons/io5";

export const navigation = [
  {
    label: "Theatrical",
    href: "/",
    icon: <MdHomeFilled />,
  },
  {
    label: "TV Shows",
    href: "tv",
    icon: <PiTelevisionFill />,
  },
  {
    label: "Trending",
    href: "movie",
    icon: <BiSolidMoviePlay />,
  },
  {
    label: "Coming Soon",
    href: "upcoming",
    icon: <BiSolidMoviePlay />,
  },
];

export const mobileNavigation = [
  ...navigation,
  {
    label: "search",
    href: "/search",
    icon: <IoSearchOutline />,
  },
];

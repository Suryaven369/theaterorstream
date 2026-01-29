import { MdHomeFilled } from "react-icons/md";
import { BiSolidMoviePlay } from "react-icons/bi";
import { IoSearchOutline } from "react-icons/io5";
import { MdUpcoming } from "react-icons/md";
import { FaTv } from "react-icons/fa";

export const navigation = [
  {
    label: "In Theaters",
    href: "/",
    icon: <MdHomeFilled />,
  },
  {
    label: "TV Series",
    href: "tv-series",
    icon: <FaTv />,
  },
  {
    label: "Coming Soon",
    href: "upcoming",
    icon: <MdUpcoming />,
  },
];

export const mobileNavigation = [
  ...navigation,
  {
    label: "Search",
    href: "/search",
    icon: <IoSearchOutline />,
  },
];

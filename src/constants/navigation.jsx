import { MdHomeFilled } from "react-icons/md";
import { IoSearchOutline } from "react-icons/io5";

/** Desktop header links — catalog lives on My Feed; Coming Soon is in the My Feed sidebar. */
export const navigation = [];

export const mobileNavigation = [
  {
    label: "Home",
    href: "/",
    icon: <MdHomeFilled />,
  },
  {
    label: "Search",
    href: "/search",
    icon: <IoSearchOutline />,
  },
];

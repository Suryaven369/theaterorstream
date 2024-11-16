import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { IoSearchOutline } from "react-icons/io5";
import { navigation } from "../constants/navigation";

const Header = () => {
  const location = useLocation();
  const removeSpace = location?.search?.slice(3)?.split("%20")?.join(" ");
  const [searchInput, setSearchInput] = useState(removeSpace);
  const navigate = useNavigate();

  useEffect(() => {
    if (searchInput) {
      navigate(`/search?q=${searchInput}`);
    }
  }, [searchInput]);

  const handleSubmit = (e) => {
    e.preventDefault();
  };

  return (
    <header className="fixed top-0 w-full h-16 bg-black bg-opacity-50 z-40">
      <div className="container mx-auto px-3 flex items-center h-full">
        <Link to={"/"} className="text-lg">
          <span className="text-yellow-300">Theater</span> or Stream
        </Link>

        <div className="ml-auto flex items-center gap-5">
          <nav className="hidden lg:flex items-center gap-5 ml-5">
            {navigation.map((nav, index) => {
              return (
                <div key={nav.label + "header" + index}>
                  <NavLink
                    to={nav.href}
                    className={({ isActive }) =>
                      `px-2 hover:text-neutral-100 ${
                        isActive && "text-yellow-300"
                      }`
                    }
                  >
                    {nav.label}
                  </NavLink>
                </div>
              );
            })}
          </nav>

          <form className="flex items-center gap-2" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Search here..."
              className="bg-neutral-800 px-4 py-2 outline-none rounded-full hidden lg:block"
              onChange={(e) => setSearchInput(e.target.value)}
              value={searchInput}
            />
            <button className="text-2xl text-white bg-neutral-800 px-2 py-2 rounded-lg">
              <IoSearchOutline />
            </button>
          </form>

          <div className="md:flex flex-row gap-2 hidden">
            <button className="bg-neutral-800 px-4 py-2 rounded-lg">
              Sign up
            </button>
            <button className="bg-neutral-800 px-4 py-2 rounded-lg">
              Log in
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;

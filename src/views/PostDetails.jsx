import { Navigate, useParams } from 'react-router-dom';

/**
 * Legacy /post/:id → Reddit-style /thread/:id
 */
export default function PostDetails() {
  const { id } = useParams();
  return <Navigate to={`/thread/${id}`} replace />;
}

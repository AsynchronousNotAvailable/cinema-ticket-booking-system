const RemoveFavoriteModal = ({ isOpen, onClose, onConfirm, movieName, posterPath }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-[100] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl scale-up-center">
        {/* Poster Preview */}
        {posterPath && (
          <img 
            src={`https://image.tmdb.org/t/p/w200${posterPath}`} 
            alt={movieName}
            className="w-24 h-36 object-cover rounded-lg mx-auto mb-4 shadow-md border-2 border-gray-100"
          />
        )}
        <p className="text-gray-500 mt-2 mb-6">
          Are you sure you want to remove <span className="font-bold text-gray-700">"{movieName}"</span>?
        </p>
        
        <div className="flex space-x-3">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition font-semibold"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition font-semibold shadow-lg shadow-red-200"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
};

export default RemoveFavoriteModal;
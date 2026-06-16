fetch('assets/data/architect.json')
    .then(Response => Response.json())
    .then(data => {
        data.forEach(function(building){
            let archCard = document.createElement('div');
            archCard.classList.add('card');
            archCard.innerHTML = `
            <div class="card-header">
                <img src="${building.imageUrl}">
                <h3 class="card-title">${building.title}</h3>
                <h4 class="romaji">${building.romaji}</h4> <h4 class="kanji">${building.kanji}</h4>
                <span class="badge">${building.category}</span>
            </div>
            <div class="card-body">
                <p>${building.shortDescription}</p>
                <ul>
                    ${building.keyFeatures.map(f => `<li>${f}</li>`).join('')}
                </ul>
                <br>
                <p>Contoh: ${building.iconicExample}</p>
            </div>
            `;

            $('#archiContent').append(archCard);
        })
})

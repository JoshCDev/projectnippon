fetch('assets/data/history.json')
    .then(response => response.json())
    .then(data => {
        data.yearRanges.forEach(function(history){
          let periodeHeader = document.createElement('div');
          periodeHeader.dataset.periode = history.label;
          periodeHeader.classList.add('periode-header');
          periodeHeader.innerHTML = `<h2>${history.label}</h2><h3>${history.from < 0 ? `${Math.abs(history.from)} SM` : `${Math.abs(history.from)} M`}</h3>`;

          $('#contentArea').append(periodeHeader);
            let periodeOptions = `
                <option value="${history.label}">${history.label}</option>
                `;
            let matchEvents = data.events.filter(function(event){
              return event.yearRangeId === history.id;
            });
                matchEvents.forEach(function(peristiwa){
                  let cardFormat = document.createElement('div');
                      cardFormat.classList.add('card');
                      cardFormat.dataset.periode = history.label;
                    let articleFormat = document.createElement("article");
                    cardFormat.classList.add('card-body');
                    articleFormat.innerHTML = `
                            <h4 class="card-subtitle">${peristiwa.title}</h4> <br>
                            <p class="card-detail">${peristiwa.body}</p>
                    `;
                    cardFormat.append(articleFormat);
                    
                    $('#contentArea').append(cardFormat);
                })
            
            $('#historyDropdown').append(periodeOptions);
        })

        $('[data-periode]').hide();
        $(`[data-periode="${data.yearRanges[0].label}"]`).show();
        $('#contentArea').addClass(data.yearRanges[0].mood);

        $('#historyDropdown').on('change', function() {
            let chosen = $(this).val();
            let moo = data.yearRanges.find(function(mud){
              return mud.label === chosen;
            })
            $('#main-content').removeClass('dark positive negative sacred casual').addClass(moo.mood);
            $('[data-periode]').hide();
            $(`[data-periode="${chosen}"]`).show();
        })
    })